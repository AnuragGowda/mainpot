-- The final payment graph is a game record, rather than a browser-only view.
-- Existing finalized games used the fewest-payments plan, so the default
-- preserves their instructions and payment keys on reload.
alter table public.games
  add column if not exists settlement_mode text not null default 'min',
  add column if not exists settlement_bank_player_id uuid references public.players(id) on delete set null;

alter table public.games
  drop constraint if exists games_settlement_mode_check;
alter table public.games
  add constraint games_settlement_mode_check
  check (settlement_mode in ('min', 'bank'));

-- RLS already limits game updates to the host. This trigger also makes the
-- phase and selected banker checks authoritative for direct Data API writes.
create or replace function public.validate_locked_settlement_plan()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_difference numeric;
  allocation_method text;
  allocation_amount numeric;
  allocation_player_ids jsonb;
  allocation_items jsonb;
  net_by_player jsonb;
  active_players jsonb;
  early_exit record;
  player_key text;
  player_net numeric;
  selected_capacity numeric;
  selected_count integer;
  seen_player_ids jsonb;
  listed_player_ids jsonb;
  custom_item jsonb;
  custom_player_id text;
  custom_amount numeric;
  custom_total numeric;
  custom_count integer;
begin
  if new.status in ('settling', 'ended') and new.status is distinct from old.status then
    if exists (select 1 from public.buy_ins where game_id = new.id and not verified) then
      raise exception 'Resolve pending buy-ins before starting cash-outs';
    end if;
    if exists (select 1 from public.early_cash_outs where game_id = new.id and status = 'requested') then
      raise exception 'Resolve requested early cash-outs before closing the table';
    end if;
  end if;
  if old.status = 'ended' and new.status is distinct from old.status then
    raise exception 'A finalized game cannot reopen';
  end if;
  if old.status = 'ended' and (
    new.settlement_mode is distinct from old.settlement_mode
    or new.settlement_bank_player_id is distinct from old.settlement_bank_player_id
    or new.discrepancy_allocation is distinct from old.discrepancy_allocation
  ) then
    raise exception 'The finalized settlement plan is immutable';
  end if;

  if (
    new.settlement_mode is distinct from old.settlement_mode
    or new.settlement_bank_player_id is distinct from old.settlement_bank_player_id
  ) then
    if old.status <> 'settling' then
      raise exception 'Choose a settlement plan while the game is settling';
    end if;
    if not public.is_game_host(new.id) then
      raise exception 'Only the host can choose the settlement plan';
    end if;
  end if;

  if new.status = 'ended' and old.status is distinct from 'ended' then
    if old.status <> 'settling' then
      raise exception 'Start cash-outs before locking the settlement';
    end if;
    if exists (
      select 1 from public.players as player
      where player.game_id = new.id and not exists (
        select 1 from public.cash_outs as cash_out
        where cash_out.game_id = new.id and cash_out.player_id = player.id
      )
    ) then
      raise exception 'Enter every player cash-out before locking the settlement';
    end if;
    select round(
      coalesce((select sum(amount) from public.buy_ins where game_id = new.id and verified), 0)
      - coalesce((select sum(amount) from public.cash_outs where game_id = new.id), 0), 2)
      into current_difference;
    if abs(current_difference) >= 0.005 and (
      new.discrepancy_allocation is null
      or coalesce(new.discrepancy_allocation->>'method', '') not in ('proportional', 'selected', 'custom')
      or coalesce((new.discrepancy_allocation->>'amount')::numeric, 0) <> abs(current_difference)
    ) then
      raise exception 'Resolve the current cash-out difference before locking the settlement';
    end if;
    if abs(current_difference) >= 0.005 then
      allocation_method := new.discrepancy_allocation->>'method';
      allocation_amount := abs(current_difference);

      -- Mirror SettlementScreen's base nets and rollForwardEarlyCashOuts.
      -- The JSON maps let the ordered early-exit loop remove a player before
      -- a later exit can use that player as its bank.
      select coalesce(jsonb_object_agg(player.id::text, to_jsonb(player.net)), '{}'::jsonb),
        coalesce(jsonb_object_agg(player.id::text, 'true'::jsonb), '{}'::jsonb)
      into net_by_player, active_players
      from (
        select p.id, round(
          coalesce((select c.amount from public.cash_outs c where c.game_id = new.id and c.player_id = p.id), 0)
          - coalesce((select sum(b.amount) from public.buy_ins b where b.game_id = new.id and b.player_id = p.id), 0)
          + coalesce((
            select sum(case
              when b.fronted_by_player_id = p.id then b.amount
              when b.player_id = p.id and b.fronted_by_player_id is not null then -b.amount
              else 0
            end)
            from public.buy_ins b
            where b.game_id = new.id
          ), 0),
          2
        ) as net
        from public.players p
        where p.game_id = new.id
      ) as player;
      for early_exit in
        select player_id, bank_player_id, net_amount
        from public.early_cash_outs
        where game_id = new.id and status = 'locked'
        order by locked_at, id
      loop
        if active_players ? early_exit.bank_player_id::text then
          net_by_player := jsonb_set(
            net_by_player,
            array[early_exit.bank_player_id::text],
            to_jsonb(round((net_by_player->>early_exit.bank_player_id::text)::numeric + early_exit.net_amount, 2)),
            true
          );
        end if;
        active_players := active_players - early_exit.player_id::text;
      end loop;

      if allocation_method = 'selected' then
        allocation_player_ids := new.discrepancy_allocation->'player_ids';
        if jsonb_typeof(allocation_player_ids) <> 'array' or jsonb_array_length(allocation_player_ids) = 0 then
          raise exception 'Choose eligible players for the discrepancy allocation';
        end if;
        selected_capacity := 0;
        selected_count := 0;
        seen_player_ids := '{}'::jsonb;
        for player_key in select value from jsonb_array_elements_text(allocation_player_ids) loop
          if seen_player_ids ? player_key
            or not (active_players ? player_key)
            or net_by_player->>player_key is null then
            raise exception 'Discrepancy allocation includes an invalid player';
          end if;
          player_net := (net_by_player->>player_key)::numeric;
          if (current_difference > 0 and player_net >= -0.005)
            or (current_difference < 0 and player_net <= 0.005) then
            raise exception 'Discrepancy allocation includes an ineligible player';
          end if;
          seen_player_ids := jsonb_set(seen_player_ids, array[player_key], 'true'::jsonb, true);
          selected_capacity := selected_capacity + abs(player_net);
          selected_count := selected_count + 1;
        end loop;
        if selected_count = 0 or selected_capacity + 0.005 < allocation_amount then
          raise exception 'Selected players cannot cover the cash-out difference';
        end if;
      elsif allocation_method = 'custom' then
        allocation_items := new.discrepancy_allocation->'player_allocations';
        allocation_player_ids := new.discrepancy_allocation->'player_ids';
        if jsonb_typeof(allocation_items) <> 'array' or jsonb_array_length(allocation_items) = 0
          or jsonb_typeof(allocation_player_ids) <> 'array' then
          raise exception 'Enter exact discrepancy amounts for eligible players';
        end if;
        seen_player_ids := '{}'::jsonb;
        custom_total := 0;
        custom_count := 0;
        for custom_item in select value from jsonb_array_elements(allocation_items) loop
          custom_player_id := custom_item->>'player_id';
          if jsonb_typeof(custom_item) <> 'object'
            or custom_player_id is null
            or seen_player_ids ? custom_player_id
            or not (active_players ? custom_player_id)
            or net_by_player->>custom_player_id is null
            or coalesce(custom_item->>'amount', '') !~ '^\\d+(\\.\\d{1,2})?$' then
            raise exception 'Discrepancy allocation includes an invalid custom amount or player';
          end if;
          custom_amount := round((custom_item->>'amount')::numeric, 2);
          player_net := (net_by_player->>custom_player_id)::numeric;
          if custom_amount < 0.005
            or custom_amount > abs(player_net) + 0.005
            or (current_difference > 0 and player_net >= -0.005)
            or (current_difference < 0 and player_net <= 0.005) then
            raise exception 'Custom discrepancy amounts must fit eligible players';
          end if;
          seen_player_ids := jsonb_set(seen_player_ids, array[custom_player_id], 'true'::jsonb, true);
          custom_total := round(custom_total + custom_amount, 2);
          custom_count := custom_count + 1;
        end loop;
        if custom_count = 0 or abs(custom_total - allocation_amount) >= 0.005
          or jsonb_array_length(allocation_player_ids) <> custom_count then
          raise exception 'Custom discrepancy amounts must exactly cover the cash-out difference';
        end if;
        listed_player_ids := '{}'::jsonb;
        for player_key in select value from jsonb_array_elements_text(allocation_player_ids) loop
          if listed_player_ids ? player_key or not (seen_player_ids ? player_key) then
            raise exception 'Custom discrepancy players must match their exact amounts';
          end if;
          listed_player_ids := jsonb_set(listed_player_ids, array[player_key], 'true'::jsonb, true);
        end loop;
      end if;
    end if;
    if not public.is_game_host(new.id) then
      raise exception 'Only the host can lock the settlement';
    end if;
    if new.settlement_mode = 'min' and new.settlement_bank_player_id is not null then
      raise exception 'A fewest-payments settlement cannot name a bank';
    end if;
    if new.settlement_mode = 'bank' and (
      new.settlement_bank_player_id is null
      or not exists (
        select 1
        from public.players
        where id = new.settlement_bank_player_id
          and game_id = new.id
          and left_at is null
      )
    ) then
      raise exception 'Choose an active player to act as the bank';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_locked_settlement_plan on public.games;
create trigger validate_locked_settlement_plan
before update of status, settlement_mode, settlement_bank_player_id, discrepancy_allocation on public.games
for each row execute function public.validate_locked_settlement_plan();

revoke all on function public.validate_locked_settlement_plan() from public;
