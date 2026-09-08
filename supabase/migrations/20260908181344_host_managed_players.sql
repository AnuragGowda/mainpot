-- A host-managed seat has no browser identity or account to impersonate.
alter table public.players alter column session_id drop not null;
alter table public.players add column host_add_operation_key uuid unique;
alter table public.players add constraint host_managed_player_identity check (
  host_add_operation_key is null or (session_id is null and user_id is null and is_host = false)
);

-- Keep the privileged implementation outside the exposed API schema. The
-- invoker wrapper below is the only Data API entry point; both paths require
-- the authenticated current host and an active, unexpired, locked game row.
create schema if not exists mainpot_private;
revoke all on schema mainpot_private from public;
grant usage on schema mainpot_private to authenticated;

create or replace function mainpot_private.add_host_player(
  input_game_id uuid, input_name text, input_buy_in numeric, input_operation_key uuid
) returns public.players
language plpgsql security definer set search_path = ''
as $$
declare
  found_game public.games%rowtype;
  added_player public.players%rowtype;
  host_player_id uuid;
  opening_id uuid;
  player_limit integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into found_game from public.games where id = input_game_id for update;
  if not found then raise exception 'Game not found.'; end if;
  if found_game.host_user_id is distinct from auth.uid() then
    raise exception 'Only the host can add players.';
  end if;
  if found_game.status <> 'active' or found_game.expires_at <= now() then
    raise exception 'This game is no longer accepting players.';
  end if;
  select id into host_player_id from public.players
  where game_id = input_game_id and is_host and user_id = auth.uid() and left_at is null;
  if host_player_id is null then raise exception 'Only the active host can add players.'; end if;
  if input_operation_key is null then raise exception 'A request key is required.'; end if;
  if input_name is null or char_length(btrim(input_name)) not between 1 and 32
    or input_name ~ '[[:cntrl:]]' or input_name ~ U&'[\2028\2029]' then
    raise exception 'Enter a player name of 1 to 32 characters without line breaks.';
  end if;
  if input_buy_in is null or input_buy_in < 0 or input_buy_in > 99999999.99
    or input_buy_in::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Enter a buy-in between 0 and 99,999,999.99.';
  end if;
  select * into added_player from public.players where host_add_operation_key = input_operation_key;
  if found then
    if added_player.game_id <> input_game_id then raise exception 'This request belongs to another game.'; end if;
    if added_player.name <> btrim(input_name)
      or coalesce((select amount from public.buy_ins where operation_key = input_operation_key), 0) <> round(input_buy_in, 2) then
      raise exception 'This request was already used for a different player or buy-in.';
    end if;
    return added_player;
  end if;
  select max_players_per_game into player_limit from public.app_config where id = true;
  if (select count(*) from public.players where game_id = input_game_id and left_at is null) >= coalesce(player_limit, 12) then
    raise exception 'This game already has the maximum number of players.';
  end if;
  perform public.consume_rate_limit('add_host_player', 3600, 100);
  insert into public.players (game_id, name, session_id, user_id, is_host, host_add_operation_key)
  values (input_game_id, btrim(input_name), null, null, false, input_operation_key)
  returning * into added_player;
  insert into public.game_events (game_id, event_type, actor_player_id, subject_player_id, metadata)
  values (input_game_id, 'player_joined', host_player_id, added_player.id,
    jsonb_build_object('player_name', added_player.name, 'added_by_host', true));
  if round(input_buy_in, 2) > 0 then
    insert into public.buy_ins (game_id, player_id, amount, type, verified, operation_key)
    values (input_game_id, added_player.id, round(input_buy_in, 2), 'buy_in', true, input_operation_key)
    returning id into opening_id;
    insert into public.game_events (game_id, event_type, actor_player_id, subject_player_id, amount, metadata)
    values (input_game_id, 'buy_in_added', host_player_id, added_player.id, round(input_buy_in, 2),
      jsonb_build_object('player_name', added_player.name, 'buy_in_id', opening_id, 'buy_in_type', 'buy_in'));
  end if;
  return added_player;
end;
$$;
revoke all on function mainpot_private.add_host_player(uuid, text, numeric, uuid) from public;
grant execute on function mainpot_private.add_host_player(uuid, text, numeric, uuid) to authenticated;

create or replace function public.add_host_player(
  input_game_id uuid, input_name text, input_buy_in numeric, input_operation_key uuid
) returns public.players
language sql security invoker set search_path = ''
as $$
  select mainpot_private.add_host_player(input_game_id, input_name, input_buy_in, input_operation_key);
$$;
revoke all on function public.add_host_player(uuid, text, numeric, uuid) from public;
grant execute on function public.add_host_player(uuid, text, numeric, uuid) to authenticated;

-- Allow hosts to manage early exits; preserve ownership checks for everyone else.
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
    and found_player.user_id is distinct from auth.uid() and found_player.session_id is distinct from input_session_id then
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

-- Allow hosts to manage early exits; preserve ownership checks for everyone else.
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
    and found_player.user_id is distinct from auth.uid()
    and found_player.session_id is distinct from input_session_id then
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

-- Allow hosts to manage early exits; preserve ownership checks for everyone else.
create or replace function mainpot_private.set_early_cash_out_payment_status(
  input_early_cash_out_id uuid,
  input_settled boolean,
  input_session_id text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  early_exit public.early_cash_outs%rowtype;
  departing public.players%rowtype;
  bank public.players%rowtype;
  from_id uuid;
  to_id uuid;
  payment_amount numeric(10,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if input_session_id is null or char_length(input_session_id) not between 8 and 128 then raise exception 'Invalid browser session'; end if;

  select * into early_exit from public.early_cash_outs where id = input_early_cash_out_id;
  if not found or early_exit.status <> 'locked' then raise exception 'Early cash-out is not locked'; end if;
  if abs(coalesce(early_exit.net_amount, 0)) <= 0.005 then raise exception 'No payment is needed'; end if;
  if not public.has_game_access(early_exit.game_id) then raise exception 'You no longer have access to this game'; end if;

  select * into departing from public.players where id = early_exit.player_id;
  select * into bank from public.players where id = early_exit.bank_player_id;
  if not public.is_game_host(early_exit.game_id)
    and departing.user_id is distinct from auth.uid()
    and bank.user_id is distinct from auth.uid()
    and departing.session_id is distinct from input_session_id
    and bank.session_id is distinct from input_session_id then
    raise exception 'Only the payer, recipient, or host can update this payment';
  end if;

  if early_exit.net_amount > 0 then
    from_id := bank.id;
    to_id := departing.id;
  else
    from_id := departing.id;
    to_id := bank.id;
  end if;
  payment_amount := round(abs(early_exit.net_amount), 2);

  insert into public.settlement_payments (
    game_id, from_player_id, to_player_id, amount, mode,
    settled, settled_at, updated_at
  ) values (
    early_exit.game_id, from_id, to_id, payment_amount, 'early_exit',
    input_settled, case when input_settled then now() else null end, now()
  )
  on conflict (game_id, from_player_id, to_player_id, amount, mode)
  do update set
    settled = excluded.settled,
    settled_at = excluded.settled_at,
    updated_at = excluded.updated_at;
end;
$$;
revoke all on function mainpot_private.set_early_cash_out_payment_status(uuid, boolean, text) from public;
grant execute on function mainpot_private.set_early_cash_out_payment_status(uuid, boolean, text) to authenticated;
create or replace function public.set_early_cash_out_payment_status(input_early_cash_out_id uuid, input_settled boolean, input_session_id text) returns void
language sql security invoker set search_path = ''
as $$ select mainpot_private.set_early_cash_out_payment_status(input_early_cash_out_id, input_settled, input_session_id); $$;

create or replace function mainpot_private.transfer_game_host(
  target_game_id uuid,
  target_player_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_host_id uuid;
  next_host public.players%rowtype;
begin
  if not public.game_has_status(target_game_id, 'active') then
    raise exception 'Host controls can only be transferred during an active game';
  end if;
  if not public.is_game_host(target_game_id) then
    raise exception 'Only the host can transfer the table';
  end if;

  select id into previous_host_id
  from public.players
  where game_id = target_game_id and is_host = true;

  if previous_host_id = target_player_id then
    raise exception 'Choose another active player as the new host';
  end if;

  select * into next_host
  from public.players
  where id = target_player_id and game_id = target_game_id and left_at is null;
  if not found then
    raise exception 'That player is no longer at the table';
  end if;

  if next_host.session_id is null then
    raise exception 'Choose a player who has joined on their own device.';
  end if;

  perform set_config('mainpot.host_transfer', 'true', true);
  update public.players
  set is_host = (id = target_player_id)
  where game_id = target_game_id;

  update public.games
  set host_user_id = next_host.user_id,
      host_session_id = next_host.session_id,
      host_name = next_host.name
  where id = target_game_id;

  insert into public.game_events (
    game_id, event_type, actor_player_id, subject_player_id, metadata
  ) values (
    target_game_id, 'host_transferred', previous_host_id, target_player_id,
    jsonb_build_object('player_name', next_host.name)
  );
end;
$$;

revoke all on function mainpot_private.transfer_game_host(uuid, uuid) from public;
grant execute on function mainpot_private.transfer_game_host(uuid, uuid) to authenticated;
create or replace function public.transfer_game_host(target_game_id uuid, target_player_id uuid) returns void
language sql security invoker set search_path = ''
as $$ select mainpot_private.transfer_game_host(target_game_id, target_player_id); $$;

create or replace function mainpot_private.join_game_guarded(
  input_code text,
  input_player_name text,
  input_session_id text
) returns table(game_id uuid, player_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  config public.app_config%rowtype;
  found_game public.games%rowtype;
  found_player public.players%rowtype;
  active_players integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.consume_rate_limit('join_game', 3600, 30);
  select * into config from public.app_config where id = true;

  if char_length(trim(input_player_name)) not between 1 and 80 then raise exception 'Player name must be between 1 and 80 characters'; end if;
  if input_session_id is null or char_length(input_session_id) not between 8 and 128 then raise exception 'Invalid browser session'; end if;

  select * into found_game from public.games
  where code = upper(trim(input_code)) and (expires_at is null or expires_at > now()) limit 1 for update;
  if not found then raise exception 'Game not found.'; end if;
  if found_game.status <> 'active' then raise exception 'This game is no longer accepting players.'; end if;

  insert into public.game_access(game_id, user_id) values (found_game.id, auth.uid())
  on conflict on constraint game_access_pkey do update set granted_at = now();

  select * into found_player from public.players as player
  where player.game_id = found_game.id
    and (player.user_id = auth.uid() or player.session_id = input_session_id)
  order by player.joined_at limit 1;
  if found then return query select found_game.id, found_player.id; return; end if;

  select count(*) into active_players from public.players as player
  where player.game_id = found_game.id and player.left_at is null;
  if active_players >= config.max_players_per_game then raise exception 'This game already has the maximum number of players.'; end if;

  insert into public.players(game_id, session_id, name, is_host, user_id)
  values (found_game.id, input_session_id, trim(input_player_name), false, auth.uid()) returning * into found_player;
  insert into public.game_events(game_id, event_type, actor_player_id, subject_player_id, metadata)
  values (found_game.id, 'player_joined', found_player.id, found_player.id, jsonb_build_object('player_name', found_player.name));
  return query select found_game.id, found_player.id;
end;
$$;
revoke all on function mainpot_private.join_game_guarded(text, text, text) from public;
grant execute on function mainpot_private.join_game_guarded(text, text, text) to authenticated;
create or replace function public.join_game_guarded(input_code text, input_player_name text, input_session_id text)
returns table(game_id uuid, player_id uuid)
language sql security invoker set search_path = ''
as $$ select * from mainpot_private.join_game_guarded(input_code, input_player_name, input_session_id); $$;
