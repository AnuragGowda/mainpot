-- A browser session copied from another player is not proof of ownership for
-- authenticated callers. Keep host management and authenticated ownership.
create or replace function mainpot_private.request_early_cash_out(
  input_game_id uuid,
  input_player_id uuid,
  input_cash_out_amount numeric,
  input_session_id text
) returns public.early_cash_outs
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_player public.players%rowtype;
  requested public.early_cash_outs%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if input_session_id is null or char_length(input_session_id) not between 8 and 128 then raise exception 'Invalid browser session'; end if;
  if input_cash_out_amount is null or input_cash_out_amount < 0 then
    raise exception 'Cash-out amount must be zero or greater';
  end if;
  if not public.game_has_status(input_game_id, 'active') then
    raise exception 'Early cash-out is only available while the table is active';
  end if;
  if not public.has_game_access(input_game_id) then
    raise exception 'You no longer have access to this game';
  end if;

  select * into found_player
  from public.players
  where id = input_player_id and game_id = input_game_id
  for update;
  if not found then raise exception 'Player not found'; end if;
  if found_player.left_at is not null then raise exception 'This player has already left the table'; end if;
  if found_player.is_host then raise exception 'Transfer the host role before requesting an early cash-out'; end if;
  if not public.is_game_host(input_game_id)
    and found_player.user_id is distinct from auth.uid() then
    raise exception 'Only the player or host can request an early cash-out';
  end if;

  insert into public.early_cash_outs (
    game_id, player_id, cash_out_amount, status, requested_at, updated_at
  ) values (
    input_game_id, input_player_id, round(input_cash_out_amount, 2), 'requested', now(), now()
  )
  on conflict (game_id, player_id) do update set
    cash_out_amount = excluded.cash_out_amount,
    status = 'requested',
    bank_player_id = null,
    verified_buy_in_amount = null,
    funding_adjustment = null,
    net_amount = null,
    requested_at = now(),
    locked_at = null,
    cancelled_at = null,
    updated_at = now()
  where public.early_cash_outs.status in ('requested', 'cancelled')
  returning * into requested;
  if not found then raise exception 'This early cash-out is already locked'; end if;

  insert into public.game_events (
    game_id, event_type, actor_player_id, subject_player_id, amount, metadata
  ) values (
    input_game_id, 'early_cash_out_requested',
    case when public.is_game_host(input_game_id) then (
      select id from public.players where game_id = input_game_id and is_host limit 1
    ) else input_player_id end, input_player_id,
    requested.cash_out_amount,
    jsonb_build_object('player_name', found_player.name)
  );
  return requested;
end;
$$;
revoke all on function mainpot_private.request_early_cash_out(uuid, uuid, numeric, text) from public;
grant execute on function mainpot_private.request_early_cash_out(uuid, uuid, numeric, text) to authenticated;
create or replace function public.request_early_cash_out(input_game_id uuid, input_player_id uuid, input_cash_out_amount numeric, input_session_id text) returns public.early_cash_outs
language sql security invoker set search_path = ''
as $$ select mainpot_private.request_early_cash_out(input_game_id, input_player_id, input_cash_out_amount, input_session_id); $$;

create or replace function mainpot_private.cancel_early_cash_out(
  input_early_cash_out_id uuid,
  input_session_id text
) returns public.early_cash_outs
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested public.early_cash_outs%rowtype;
  found_player public.players%rowtype;
  caller_is_host boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if input_session_id is null or char_length(input_session_id) not between 8 and 128 then raise exception 'Invalid browser session'; end if;

  select * into requested from public.early_cash_outs
  where id = input_early_cash_out_id for update;
  if not found then raise exception 'Early cash-out request not found'; end if;
  if requested.status <> 'requested' then raise exception 'Only a pending early cash-out can be cancelled'; end if;
  if not public.game_has_status(requested.game_id, 'active') then
    raise exception 'The active ledger is already closed';
  end if;

  select * into found_player from public.players where id = requested.player_id;
  caller_is_host := public.is_game_host(requested.game_id);
  if not caller_is_host
    and found_player.user_id is distinct from auth.uid() then
    raise exception 'Only the player or host can cancel this request';
  end if;

  update public.early_cash_outs set
    status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = requested.id returning * into requested;

  insert into public.game_events (
    game_id, event_type, actor_player_id, subject_player_id, amount, metadata
  ) values (
    requested.game_id, 'early_cash_out_cancelled',
    case when caller_is_host then (
      select id from public.players where game_id = requested.game_id and is_host limit 1
    ) else requested.player_id end,
    requested.player_id, requested.cash_out_amount,
    jsonb_build_object('player_name', found_player.name)
  );
  return requested;
end;
$$;
revoke all on function mainpot_private.cancel_early_cash_out(uuid, text) from public;
grant execute on function mainpot_private.cancel_early_cash_out(uuid, text) to authenticated;
create or replace function public.cancel_early_cash_out(input_early_cash_out_id uuid, input_session_id text) returns public.early_cash_outs
language sql security invoker set search_path = ''
as $$ select mainpot_private.cancel_early_cash_out(input_early_cash_out_id, input_session_id); $$;
