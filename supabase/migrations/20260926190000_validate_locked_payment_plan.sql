-- Payment acknowledgements are records of the plan locked when a game ended.
-- Recompute that plan server-side so a valid participant cannot add a made-up
-- debt, amount, counterparty, or settlement mode through the Data API.
create or replace function public.set_settlement_payment_status_guarded(
  input_game_id uuid,
  input_from_player_id uuid,
  input_to_player_id uuid,
  input_amount numeric,
  input_mode text,
  input_settled boolean,
  input_session_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_game public.games%rowtype;
  caller_has_access boolean;
  caller_can_manage boolean;
  current_difference numeric;
  net_by_player jsonb;
  active_players jsonb;
  allocation jsonb;
  allocation_method text;
  allocation_amount numeric;
  allocation_remaining numeric;
  allocation_capacity numeric;
  allocation_count integer;
  allocation_index integer;
  allocation_item jsonb;
  allocation_player_id text;
  allocation_share numeric;
  early_exit record;
  candidate record;
  creditor_queue jsonb;
  debtor_queue jsonb;
  creditor_index integer;
  debtor_index integer;
  creditor_id uuid;
  debtor_id uuid;
  creditor_net numeric;
  debtor_net numeric;
  transfer_amount numeric;
  expected boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if char_length(input_session_id) not between 8 and 128 then
    raise exception 'Invalid browser session';
  end if;
  if input_from_player_id is null
    or input_to_player_id is null
    or input_from_player_id = input_to_player_id then
    raise exception 'This payment cannot be identified';
  end if;
  if input_amount is null
    or input_amount = 'NaN'::numeric
    or input_amount <> round(input_amount, 2)
    or input_amount <= 0 then
    raise exception 'Payment amount must be a positive number of cents';
  end if;
  if input_mode not in ('min', 'bank') then
    raise exception 'Invalid settlement mode';
  end if;

  select * into locked_game
  from public.games
  where id = input_game_id;
  if not found or locked_game.status <> 'ended' then
    raise exception 'Payment tracking starts after the settlement is locked';
  end if;
  if input_mode <> locked_game.settlement_mode then
    raise exception 'This payment does not match the finalized settlement plan';
  end if;
  if not exists (
    select 1 from public.players
    where id = input_from_player_id and game_id = input_game_id
  ) or not exists (
    select 1 from public.players
    where id = input_to_player_id and game_id = input_game_id
  ) then
    raise exception 'This payment does not belong to this game';
  end if;


  select public.has_game_access(input_game_id) or public.is_game_host(input_game_id)
  into caller_has_access;
  if not caller_has_access then
    raise exception 'You no longer have access to this game';
  end if;

  select
    public.is_game_host(input_game_id)
    or public.owns_player(input_from_player_id)
    or public.owns_player(input_to_player_id)
    or exists (
      select 1 from public.games
      where id = input_game_id and host_session_id = input_session_id
    )
    or exists (
      select 1 from public.players
      where id in (input_from_player_id, input_to_player_id)
        and game_id = input_game_id
        and session_id = input_session_id
    )
  into caller_can_manage;
  if not caller_can_manage then
    raise exception 'Only the sender, recipient, or host can update this payment';
  end if;

  -- Keep this calculation in lockstep with SettlementScreen: verified buy-ins
  -- establish chip results, fronts shift the cash obligation, then every locked
  -- early departure rolls its signed result into the bank that paid it.
  select coalesce(jsonb_object_agg(player.id::text, to_jsonb(player.net)), '{}'::jsonb),
    coalesce(jsonb_object_agg(player.id::text, 'true'::jsonb), '{}'::jsonb)
  into net_by_player, active_players
  from (
    select p.id, round(
      coalesce((select c.amount from public.cash_outs c where c.game_id = input_game_id and c.player_id = p.id), 0)
      - coalesce((select sum(b.amount) from public.buy_ins b where b.game_id = input_game_id and b.player_id = p.id and b.verified), 0)
      + coalesce((
        select sum(case
          when b.fronted_by_player_id = p.id then b.amount
          when b.player_id = p.id and b.fronted_by_player_id is not null then -b.amount
          else 0
        end)
        from public.buy_ins b
        where b.game_id = input_game_id and b.verified
      ), 0),
      2
    ) as net
    from public.players p
    where p.game_id = input_game_id
  ) as player;

  for early_exit in
    select player_id, bank_player_id, net_amount
    from public.early_cash_outs
    where game_id = input_game_id and status = 'locked'
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

  select round(
    coalesce((select sum(amount) from public.buy_ins where game_id = input_game_id and verified), 0)
    - coalesce((select sum(amount) from public.cash_outs where game_id = input_game_id), 0),
    2
  ) into current_difference;

  if abs(current_difference) >= 0.005 then
    allocation := locked_game.discrepancy_allocation;
    allocation_method := allocation->>'method';
    allocation_amount := abs(current_difference);
    if allocation is null
      or allocation_method not in ('proportional', 'selected', 'custom')
      or round(coalesce((allocation->>'amount')::numeric, -1), 2) <> allocation_amount then
      raise exception 'The finalized discrepancy allocation is invalid';
    end if;

    if allocation_method = 'custom' then
      for allocation_item in select value from jsonb_array_elements(allocation->'player_allocations') loop
        allocation_player_id := allocation_item->>'player_id';
        allocation_share := round((allocation_item->>'amount')::numeric, 2);
        if allocation_player_id is null
          or not (active_players ? allocation_player_id)
          or net_by_player->>allocation_player_id is null then
          raise exception 'The finalized discrepancy allocation is invalid';
        end if;
        net_by_player := jsonb_set(
          net_by_player,
          array[allocation_player_id],
          to_jsonb(round(
            (net_by_player->>allocation_player_id)::numeric
            + case when current_difference > 0 then allocation_share else -allocation_share end,
            2
          )),
          true
        );
      end loop;
    else
      select coalesce(sum(abs((net_by_player->>p.id::text)::numeric)), 0), count(*)
      into allocation_capacity, allocation_count
      from public.players p
      where p.game_id = input_game_id
        and active_players ? p.id::text
        and (current_difference > 0 and (net_by_player->>p.id::text)::numeric < -0.005
          or current_difference < 0 and (net_by_player->>p.id::text)::numeric > 0.005)
        and (
          allocation_method = 'proportional'
          or p.id::text in (select value from jsonb_array_elements_text(allocation->'player_ids'))
        );
      if allocation_count = 0 or allocation_capacity + 0.005 < allocation_amount then
        raise exception 'The finalized discrepancy allocation is invalid';
      end if;

      allocation_remaining := allocation_amount;
      allocation_index := 0;
      for candidate in
        select p.id, (net_by_player->>p.id::text)::numeric as net
        from public.players p
        where p.game_id = input_game_id
          and active_players ? p.id::text
          and (current_difference > 0 and (net_by_player->>p.id::text)::numeric < -0.005
            or current_difference < 0 and (net_by_player->>p.id::text)::numeric > 0.005)
          and (
            allocation_method = 'proportional'
            or p.id::text in (select value from jsonb_array_elements_text(allocation->'player_ids'))
          )
        order by p.joined_at, p.id
      loop
        allocation_index := allocation_index + 1;
        allocation_share := case
          when allocation_index = allocation_count then allocation_remaining
          else round(allocation_amount * abs(candidate.net) / allocation_capacity, 2)
        end;
        allocation_remaining := round(allocation_remaining - allocation_share, 2);
        net_by_player := jsonb_set(
          net_by_player,
          array[candidate.id::text],
          to_jsonb(round(candidate.net + case when current_difference > 0 then allocation_share else -allocation_share end, 2)),
          true
        );
      end loop;
    end if;
  end if;

  if input_mode = 'bank' then
    if locked_game.settlement_bank_player_id is null
      or not (active_players ? locked_game.settlement_bank_player_id::text) then
      raise exception 'The finalized settlement bank is invalid';
    end if;
    for candidate in
      select p.id, (net_by_player->>p.id::text)::numeric as net
      from public.players p
      where p.game_id = input_game_id
        and active_players ? p.id::text
        and p.id <> locked_game.settlement_bank_player_id
      order by p.joined_at, p.id
    loop
      transfer_amount := round(abs(candidate.net), 2);
      if transfer_amount >= 0.005 and transfer_amount = input_amount
        and (
          (candidate.net < -0.005 and input_from_player_id = candidate.id and input_to_player_id = locked_game.settlement_bank_player_id)
          or (candidate.net > 0.005 and input_from_player_id = locked_game.settlement_bank_player_id and input_to_player_id = candidate.id)
        ) then
        expected := true;
        exit;
      end if;
    end loop;
  else
    -- calculateMinTransfers sorts the initial creditor and debtor queues once.
    -- It then consumes the first entry in each queue until either reaches zero;
    -- re-sorting after a partial transfer would produce a different locked plan.
    select coalesce(jsonb_agg(
      jsonb_build_object('id', p.id, 'net', (net_by_player->>p.id::text)::numeric)
      order by (net_by_player->>p.id::text)::numeric desc, p.joined_at, p.id
    ), '[]'::jsonb)
    into creditor_queue
    from public.players p
    where p.game_id = input_game_id
      and active_players ? p.id::text
      and (net_by_player->>p.id::text)::numeric > 0.005;

    select coalesce(jsonb_agg(
      jsonb_build_object('id', p.id, 'net', (net_by_player->>p.id::text)::numeric)
      order by abs((net_by_player->>p.id::text)::numeric) desc, p.joined_at, p.id
    ), '[]'::jsonb)
    into debtor_queue
    from public.players p
    where p.game_id = input_game_id
      and active_players ? p.id::text
      and (net_by_player->>p.id::text)::numeric < -0.005;

    creditor_index := 0;
    debtor_index := 0;
    while creditor_index < jsonb_array_length(creditor_queue)
      and debtor_index < jsonb_array_length(debtor_queue)
    loop
      creditor_id := (creditor_queue->creditor_index->>'id')::uuid;
      creditor_net := (creditor_queue->creditor_index->>'net')::numeric;
      debtor_id := (debtor_queue->debtor_index->>'id')::uuid;
      debtor_net := (debtor_queue->debtor_index->>'net')::numeric;
      transfer_amount := round(least(creditor_net, abs(debtor_net)), 2);

      if transfer_amount = input_amount
        and creditor_id = input_to_player_id
        and debtor_id = input_from_player_id then
        expected := true;
        exit;
      end if;

      creditor_net := round(creditor_net - transfer_amount, 2);
      debtor_net := round(debtor_net + transfer_amount, 2);
      if abs(creditor_net) <= 0.005 then
        creditor_index := creditor_index + 1;
      else
        creditor_queue := jsonb_set(
          creditor_queue,
          array[creditor_index::text, 'net'],
          to_jsonb(creditor_net),
          true
        );
      end if;
      if abs(debtor_net) <= 0.005 then
        debtor_index := debtor_index + 1;
      else
        debtor_queue := jsonb_set(
          debtor_queue,
          array[debtor_index::text, 'net'],
          to_jsonb(debtor_net),
          true
        );
      end if;
    end loop;
  end if;

  if not expected then
    raise exception 'This payment does not match the finalized settlement plan';
  end if;

  insert into public.settlement_payments (
    game_id, from_player_id, to_player_id, amount, mode, settled, settled_at, updated_at
  ) values (
    input_game_id, input_from_player_id, input_to_player_id, input_amount, input_mode,
    input_settled, case when input_settled then now() else null end, now()
  )
  on conflict (game_id, from_player_id, to_player_id, amount, mode)
  do update set
    settled = excluded.settled,
    settled_at = excluded.settled_at,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.set_settlement_payment_status_guarded(
  uuid, uuid, uuid, numeric, text, boolean, text
) from public;
grant execute on function public.set_settlement_payment_status_guarded(
  uuid, uuid, uuid, numeric, text, boolean, text
) to authenticated;


-- Final payment writes go through the guarded RPC. Both that function and the
-- independent locked early-exit function are SECURITY DEFINER functions, so
-- removing direct authenticated table mutations cannot block legitimate payment
-- acknowledgements while it closes the Data API bypass.
drop policy if exists "settlement payments created by parties or host" on public.settlement_payments;
drop policy if exists "settlement payments updated by parties or host" on public.settlement_payments;
revoke insert, update, delete on table public.settlement_payments from anon, authenticated;
