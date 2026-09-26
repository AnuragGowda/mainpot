-- A player name identifies one seat only inside its game. The key is kept
-- separately from the financial player row so old duplicate beta rows can
-- remain historically intact while every new write is rejected.
create or replace function mainpot_private.player_lobby_name_key(input_name text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select lower(
    btrim(
      regexp_replace(normalize(input_name, NFKC), '[[:space:]]+', ' ', 'g')
    )
  );
$$;

revoke all on function mainpot_private.player_lobby_name_key(text) from public;

create table mainpot_private.player_lobby_name_reservations (
  game_id uuid not null references public.games(id) on delete cascade,
  normalized_name text not null,
  player_id uuid not null references public.players(id) on delete cascade,
  primary key (game_id, normalized_name)
);

revoke all on table mainpot_private.player_lobby_name_reservations from public;

-- Keep one reservation for each existing legacy name. If a beta game already
-- contains duplicates, this does not rewrite either player row or its audit
-- history; it only prevents another seat from taking that name.
insert into mainpot_private.player_lobby_name_reservations (
  game_id, normalized_name, player_id
)
select distinct on (
  player.game_id,
  mainpot_private.player_lobby_name_key(player.name)
)
  player.game_id,
  mainpot_private.player_lobby_name_key(player.name),
  player.id
from public.players as player
where player.game_id is not null
order by
  player.game_id,
  mainpot_private.player_lobby_name_key(player.name),
  player.joined_at,
  player.id;

create or replace function mainpot_private.guard_player_lobby_name()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_name_key text;
  previous_normalized_name text;
  reserved_game_id uuid;
  reservation_player_id uuid;
  replacement_player_id uuid;
begin
  -- A player outside a game has no lobby namespace. Existing rows are kept
  -- compatible with the older nullable foreign-key shape.
  if new.game_id is null then
    return new;
  end if;

  target_name_key := mainpot_private.player_lobby_name_key(new.name);

  if tg_op = 'UPDATE' and old.game_id is not distinct from new.game_id
    and old.name is not distinct from new.name then
    return new;
  end if;

  -- This makes legacy-reservation reconciliation deterministic. The unique
  -- reservation below remains the final concurrency boundary: a concurrent
  -- statement with an older READ COMMITTED snapshot cannot insert a second
  -- `(game_id, normalized_name)` row.
  if tg_op = 'UPDATE' and old.game_id is not null
    and old.game_id is distinct from new.game_id then
    if old.game_id::text < new.game_id::text then
      perform pg_advisory_xact_lock(hashtextextended(old.game_id::text, 0));
      perform pg_advisory_xact_lock(hashtextextended(new.game_id::text, 0));
    else
      perform pg_advisory_xact_lock(hashtextextended(new.game_id::text, 0));
      perform pg_advisory_xact_lock(hashtextextended(old.game_id::text, 0));
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended(new.game_id::text, 0));
  end if;

  if tg_op = 'UPDATE' and old.game_id is not distinct from new.game_id then
    previous_normalized_name := mainpot_private.player_lobby_name_key(old.name);
    if previous_normalized_name = target_name_key then
      -- A pre-migration duplicate is grandfathered only while untouched. A
      -- spelling-only rewrite of one duplicate would alter its name history
      -- without resolving the collision, so require an explicit unique rename.
      if exists (
        select 1
        from public.players as player
        where player.game_id = new.game_id
          and player.id <> new.id
          and mainpot_private.player_lobby_name_key(player.name) = target_name_key
      ) then
        raise exception using
          errcode = 'unique_violation',
          message = 'A player with that name is already in this game.';
      end if;
      return new;
    end if;
  end if;

  insert into mainpot_private.player_lobby_name_reservations (
    game_id, normalized_name, player_id
  ) values (
    new.game_id, target_name_key, new.id
  )
  on conflict (game_id, normalized_name) do nothing
  returning game_id into reserved_game_id;

  if reserved_game_id is null then
    raise exception using
      errcode = 'unique_violation',
      message = 'A player with that name is already in this game.';
  end if;

  if tg_op = 'UPDATE' and old.game_id is not null then
    previous_normalized_name := mainpot_private.player_lobby_name_key(old.name);
    if old.game_id is distinct from new.game_id
      or previous_normalized_name is distinct from target_name_key then
      select reservation.player_id into reservation_player_id
      from mainpot_private.player_lobby_name_reservations as reservation
      where reservation.game_id = old.game_id
        and reservation.normalized_name = previous_normalized_name
      for update;

      if reservation_player_id = old.id then
        select player.id into replacement_player_id
        from public.players as player
        where player.game_id = old.game_id
          and player.id <> new.id
          and mainpot_private.player_lobby_name_key(player.name) = previous_normalized_name
        order by player.joined_at, player.id
        limit 1;

        if replacement_player_id is null then
          delete from mainpot_private.player_lobby_name_reservations as reservation
          where reservation.game_id = old.game_id
            and reservation.normalized_name = previous_normalized_name
            and reservation.player_id = old.id;
        else
          update mainpot_private.player_lobby_name_reservations as reservation
          set player_id = replacement_player_id
          where reservation.game_id = old.game_id
            and reservation.normalized_name = previous_normalized_name
            and reservation.player_id = old.id;
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function mainpot_private.guard_player_lobby_name() from public;

create or replace function mainpot_private.release_player_lobby_name()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_name_key text;
  replacement_player_id uuid;
begin
  if old.game_id is null then
    return old;
  end if;

  target_name_key := mainpot_private.player_lobby_name_key(old.name);
  perform pg_advisory_xact_lock(hashtextextended(old.game_id::text, 0));

  select player.id into replacement_player_id
  from public.players as player
  where player.game_id = old.game_id
    and player.id <> old.id
    and mainpot_private.player_lobby_name_key(player.name) = target_name_key
  order by player.joined_at, player.id
  limit 1;

  if replacement_player_id is null then
    delete from mainpot_private.player_lobby_name_reservations as reservation
    where reservation.game_id = old.game_id
      and reservation.normalized_name = target_name_key
      and reservation.player_id = old.id;
  else
    update mainpot_private.player_lobby_name_reservations as reservation
    set player_id = replacement_player_id
    where reservation.game_id = old.game_id
      and reservation.normalized_name = target_name_key
      and reservation.player_id = old.id;
  end if;

  return old;
end;
$$;

revoke all on function mainpot_private.release_player_lobby_name() from public;

drop trigger if exists guard_player_lobby_name on public.players;
create trigger guard_player_lobby_name
after insert or update of game_id, name on public.players
for each row execute function mainpot_private.guard_player_lobby_name();

drop trigger if exists release_player_lobby_name on public.players;
create trigger release_player_lobby_name
before delete on public.players
for each row execute function mainpot_private.release_player_lobby_name();

-- A browser session is not proof of player ownership. A caller may resume its
-- own authenticated seat with any current browser session, but a copied
-- session ID cannot return another account's player row.
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
    and player.user_id = auth.uid()
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
