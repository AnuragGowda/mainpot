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
begin
  if new.status in ('settling', 'ended') and new.status is distinct from old.status then
    if exists (select 1 from public.buy_ins where game_id = new.id and not verified) then
      raise exception 'Resolve pending buy-ins before starting cash-outs';
    end if;
    if exists (select 1 from public.early_cash_outs where game_id = new.id and status = 'requested') then
      raise exception 'Resolve requested early cash-outs before closing the table';
    end if;
  end if;
  if old.status = 'ended' and (
    new.settlement_mode is distinct from old.settlement_mode
    or new.settlement_bank_player_id is distinct from old.settlement_bank_player_id
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
      or new.discrepancy_allocation->>'method' not in ('proportional', 'selected', 'custom')
      or coalesce((new.discrepancy_allocation->>'amount')::numeric, 0) <> abs(current_difference)
    ) then
      raise exception 'Resolve the current cash-out difference before locking the settlement';
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
before update of status, settlement_mode, settlement_bank_player_id on public.games
for each row execute function public.validate_locked_settlement_plan();

revoke all on function public.validate_locked_settlement_plan() from public;
