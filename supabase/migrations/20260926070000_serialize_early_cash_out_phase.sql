-- Serialize early-cash-out lifecycle changes with game phase transitions.
-- The same game-row lock used for buy-ins and cash-outs closes the window
-- between a request's active-phase check and its insert.
create or replace function mainpot_private.serialize_ledger_phase()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_game_id uuid;
  current_status text;
  target_player_id uuid;
begin
  -- Trusted maintenance/fixture operations already bypass RLS. User RPCs
  -- retain the authenticated JWT role even when they run as security definer.
  if auth.role() is null or auth.role() = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    target_game_id := old.game_id;
    target_player_id := old.player_id;
  else
    target_game_id := new.game_id;
    target_player_id := new.player_id;
  end if;
  select status into current_status
  from public.games
  where id = target_game_id
  for update;

  if tg_table_name = 'buy_ins' and current_status is distinct from 'active' then
    raise exception 'The active ledger is already closed';
  end if;
  if tg_table_name = 'cash_outs' and current_status is distinct from 'settling' then
    -- The host's early-exit RPC writes the cash-out immediately before it
    -- locks the matching request in the same transaction.
    if tg_op = 'DELETE' then raise exception 'Cash-outs are read-only'; end if;
    if current_status is distinct from 'active' or not public.is_game_host(target_game_id)
      or not exists (
        select 1 from public.early_cash_outs as early_exit
        where early_exit.game_id = target_game_id and early_exit.player_id = target_player_id
          and early_exit.status = 'requested' and early_exit.cash_out_amount = new.amount
      ) then
      raise exception 'Cash-outs can only change during settlement';
    end if;
  end if;
  if tg_table_name = 'early_cash_outs' then
    -- Payment completion is stored in settlement_payments; ordinary metadata
    -- updates to an already locked early exit do not pass through this branch.
    if tg_op = 'UPDATE' and new.status is not distinct from old.status then
      return new;
    end if;
    if current_status is distinct from 'active' then
      raise exception 'Early cash-outs can only change while the table is active';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function mainpot_private.serialize_ledger_phase() from public;

create trigger serialize_early_cash_out_phase
before insert or update of status on public.early_cash_outs
for each row execute function mainpot_private.serialize_ledger_phase();
