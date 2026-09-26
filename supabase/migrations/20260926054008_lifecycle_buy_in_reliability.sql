-- Keep recovery practical for an account-free host without silently ending an
-- unfinished ledger. Three creations are already permitted per day, so two
-- concurrent active tables leave a small, explicit escape hatch.
alter table public.app_config
  alter column guest_active_games set default 2;

update public.app_config
set guest_active_games = 2
where id = true and guest_active_games = 1;

-- Joining a table is one financial operation: either the existing seat is
-- returned unchanged, or the new seat, pending opening buy-in, and audit trail
-- are all committed together. A refresh/retry cannot insert a second entry.
create or replace function mainpot_private.join_game_guarded(
  input_code text,
  input_player_name text,
  input_session_id text
) returns table(game_id uuid, player_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  config public.app_config%rowtype;
  found_game public.games%rowtype;
  found_player public.players%rowtype;
  opening_buy_in_id uuid;
  active_players integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.consume_rate_limit('join_game', 3600, 30);
  select * into config from public.app_config where id = true;

  if char_length(btrim(input_player_name)) not between 1 and 32
    or input_player_name ~ '[[:cntrl:]]' or input_player_name ~ U&'[\2028\2029]' then
    raise exception 'Enter a player name of 1 to 32 characters without line breaks.';
  end if;
  if input_session_id is null or char_length(input_session_id) not between 8 and 128 then
    raise exception 'Invalid browser session';
  end if;

  select * into found_game
  from public.games
  where code = upper(btrim(input_code))
    and (expires_at is null or expires_at > now())
  limit 1
  for update;
  if not found then raise exception 'Game not found.'; end if;
  if found_game.status <> 'active' then raise exception 'This game is no longer accepting players.'; end if;

  insert into public.game_access(game_id, user_id)
  values (found_game.id, auth.uid())
  on conflict on constraint game_access_pkey do update set granted_at = now();

  select * into found_player
  from public.players as player
  where player.game_id = found_game.id
    and (player.user_id = auth.uid() or player.session_id = input_session_id)
  order by player.joined_at
  limit 1;
  if found then
    return query select found_game.id, found_player.id;
    return;
  end if;

  select count(*) into active_players
  from public.players as player
  where player.game_id = found_game.id and player.left_at is null;
  if active_players >= config.max_players_per_game then
    raise exception 'This game already has the maximum number of players.';
  end if;

  insert into public.players(game_id, session_id, name, is_host, user_id)
  values (found_game.id, input_session_id, btrim(input_player_name), false, auth.uid())
  returning * into found_player;

  insert into public.buy_ins(game_id, player_id, amount, type, verified)
  values (found_game.id, found_player.id, round(found_game.buy_in_amount, 2), 'buy_in', false)
  returning id into opening_buy_in_id;

  insert into public.game_events(game_id, event_type, actor_player_id, subject_player_id, amount, metadata)
  values
    (found_game.id, 'player_joined', found_player.id, found_player.id,
      null, jsonb_build_object('player_name', found_player.name)),
    (found_game.id, 'buy_in_added', found_player.id, found_player.id,
      round(found_game.buy_in_amount, 2), jsonb_build_object(
        'player_name', found_player.name,
        'buy_in_id', opening_buy_in_id,
        'buy_in_type', 'buy_in'
      ));

  return query select found_game.id, found_player.id;
end;
$$;

revoke all on function mainpot_private.join_game_guarded(text, text, text) from public;
grant execute on function mainpot_private.join_game_guarded(text, text, text) to authenticated;

create or replace function public.join_game_guarded(
  input_code text,
  input_player_name text,
  input_session_id text
) returns table(game_id uuid, player_id uuid)
language sql
security invoker
set search_path = ''
as $$
  select * from mainpot_private.join_game_guarded(input_code, input_player_name, input_session_id);
$$;

revoke all on function public.join_game_guarded(text, text, text) from public;
grant execute on function public.join_game_guarded(text, text, text) to authenticated;

-- Host amount corrections are idempotent, immediately verified, and audited
-- in one transaction. Keeping correction keys in a private table allows the
-- browser to abort a stalled request and safely retry the same operation.
create table if not exists mainpot_private.buy_in_corrections (
  operation_key uuid primary key,
  buy_in_id uuid not null references public.buy_ins(id) on delete cascade,
  amount numeric(10,2) not null,
  created_at timestamptz not null default now()
);

revoke all on table mainpot_private.buy_in_corrections from public;

-- RLS still permits the host to approve an entry, but amount changes must use
-- the correction RPC so the amount, approval, and event cannot split across
-- separate client requests.
create or replace function public.require_audited_buy_in_correction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.amount is distinct from old.amount
    and current_setting('mainpot.host_buy_in_correction', true) is distinct from 'true' then
    raise exception 'Use the host correction action to change a buy-in amount.';
  end if;
  return new;
end;
$$;

drop trigger if exists require_audited_buy_in_correction on public.buy_ins;
create trigger require_audited_buy_in_correction
before update of amount on public.buy_ins
for each row execute function public.require_audited_buy_in_correction();

create or replace function mainpot_private.correct_buy_in_as_host(
  input_buy_in_id uuid,
  input_amount numeric,
  input_operation_key uuid
) returns public.buy_ins
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.buy_ins%rowtype;
  corrected public.buy_ins%rowtype;
  correction mainpot_private.buy_in_corrections%rowtype;
  subject public.players%rowtype;
  host_player_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if input_operation_key is null then raise exception 'A correction key is required.'; end if;
  if input_amount is null or input_amount < 0.01 or input_amount > 99999999.99
    or input_amount::text in ('NaN', 'Infinity', '-Infinity')
    or round(input_amount, 2) <> input_amount then
    raise exception 'Enter an amount between $0.01 and $99,999,999.99 with no more than two decimals.';
  end if;

  select * into previous from public.buy_ins where id = input_buy_in_id for update;
  if not found then raise exception 'Buy-in not found.'; end if;
  if not public.is_game_host(previous.game_id) then raise exception 'Only the host can correct a buy-in.'; end if;

  -- A retry is still an authorization check. Do not disclose or replay a
  -- correction merely because another caller knows its UUID.
  select * into correction
  from mainpot_private.buy_in_corrections
  where operation_key = input_operation_key;
  if found then
    if correction.buy_in_id <> input_buy_in_id or correction.amount <> round(input_amount, 2) then
      raise exception 'This correction key belongs to a different buy-in.';
    end if;
    return previous;
  end if;

  if not public.game_has_status(previous.game_id, 'active') then
    raise exception 'The active ledger is already closed.';
  end if;

  perform set_config('mainpot.host_buy_in_correction', 'true', true);
  update public.buy_ins
  set amount = round(input_amount, 2), verified = true
  where id = previous.id
  returning * into corrected;

  insert into mainpot_private.buy_in_corrections(operation_key, buy_in_id, amount)
  values (input_operation_key, corrected.id, corrected.amount);

  select * into subject from public.players where id = corrected.player_id;
  select id into host_player_id from public.players
  where game_id = corrected.game_id and is_host = true and left_at is null
  limit 1;
  insert into public.game_events(game_id, event_type, actor_player_id, subject_player_id, amount, metadata)
  values (
    corrected.game_id, 'buy_in_updated', host_player_id, corrected.player_id, corrected.amount,
    jsonb_build_object(
      'player_name', subject.name,
      'buy_in_id', corrected.id,
      'buy_in_type', corrected.type,
      'previous_amount', previous.amount,
      'verified_by_correction', true
    )
  );
  return corrected;
end;
$$;

revoke all on function mainpot_private.correct_buy_in_as_host(uuid, numeric, uuid) from public;
grant execute on function mainpot_private.correct_buy_in_as_host(uuid, numeric, uuid) to authenticated;

create or replace function public.correct_buy_in_as_host(
  input_buy_in_id uuid,
  input_amount numeric,
  input_operation_key uuid
) returns public.buy_ins
language sql
security invoker
set search_path = ''
as $$
  select mainpot_private.correct_buy_in_as_host(input_buy_in_id, input_amount, input_operation_key);
$$;

revoke all on function public.correct_buy_in_as_host(uuid, numeric, uuid) from public;
grant execute on function public.correct_buy_in_as_host(uuid, numeric, uuid) to authenticated;
