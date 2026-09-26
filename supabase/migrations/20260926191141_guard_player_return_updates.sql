-- The application only needs direct player-row updates to mark a departure.
-- A cleared left_at must go through the host-checked restore RPC below.
revoke update on table public.players from public, anon, authenticated;
grant update (left_at) on table public.players to authenticated;

create or replace function mainpot_private.guard_player_return()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_game public.games%rowtype;
  player_limit integer;
begin
  if old.left_at is null or new.left_at is not null then
    return new;
  end if;

  -- Trusted maintenance/fixtures may bypass user authorization. Supabase
  -- requests retain their JWT role even when the restore RPC is a definer.
  if auth.role() is null or auth.role() = 'service_role' then
    return new;
  end if;

  if new.id is distinct from old.id or new.game_id is distinct from old.game_id then
    raise exception 'A player return cannot move a seat between games.';
  end if;
  if auth.uid() is null or not public.is_game_host(old.game_id) then
    raise exception 'Only the host can return a player to the table.';
  end if;
  if current_setting('mainpot.restore_player_to_table', true)
    is distinct from (old.game_id::text || ':' || old.id::text) then
    raise exception 'Use the host-authorized return action to restore this seat.';
  end if;

  -- The marker is set only by restore_player_to_table after it locks the game
  -- and player in that order. Direct PATCH attempts fail above before taking a
  -- game lock, so they cannot reverse that lock order.
  select * into found_game
  from public.games
  where id = old.game_id;
  if found_game.id is null or found_game.status <> 'active' or found_game.expires_at <= now() then
    raise exception 'Players can only return while the table is active.';
  end if;
  if old.is_host then
    raise exception 'The host cannot be returned to the table with this action.';
  end if;
  if exists (
    select 1 from public.early_cash_outs as early_exit
    where early_exit.game_id = old.game_id
      and early_exit.player_id = old.id
      and early_exit.status in ('requested', 'locked')
  ) then
    raise exception 'A requested or locked early cash-out prevents this player from returning.';
  end if;

  select max_players_per_game into player_limit from public.app_config where id = true;
  if (
    select count(*) from public.players
    where game_id = old.game_id and left_at is null
  ) >= coalesce(player_limit, 12) then
    raise exception 'This game already has the maximum number of players.';
  end if;

  return new;
end;
$$;
revoke all on function mainpot_private.guard_player_return() from public, anon, authenticated;

drop trigger if exists guard_player_return on public.players;
create trigger guard_player_return
before update of left_at on public.players
for each row execute function mainpot_private.guard_player_return();

-- Keep the restore RPC aligned with the update guard. The transaction-local
-- marker proves that this transition passed the checks while holding the game
-- lock, without letting raw PostgREST PATCH reverse the row/game lock order.
create or replace function mainpot_private.restore_player_to_table(
  input_game_id uuid,
  input_player_id uuid
) returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_game public.games%rowtype;
  found_player public.players%rowtype;
  active_host_id uuid;
  player_limit integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into found_game
  from public.games
  where id = input_game_id
  for update;
  if not found then raise exception 'Game not found.'; end if;
  if found_game.host_user_id is distinct from auth.uid() then
    raise exception 'Only the host can return a player to the table.';
  end if;
  if found_game.status <> 'active' or found_game.expires_at <= now() then
    raise exception 'Players can only return while the table is active.';
  end if;

  select player.id into active_host_id
  from public.players as player
  where player.game_id = input_game_id
    and player.is_host
    and player.user_id = auth.uid()
    and player.left_at is null;
  if active_host_id is null then
    raise exception 'Only the active host can return a player to the table.';
  end if;

  select * into found_player
  from public.players
  where id = input_player_id and game_id = input_game_id
  for update;
  if not found then raise exception 'Player not found.'; end if;
  if found_player.is_host then
    raise exception 'The host cannot be returned to the table with this action.';
  end if;
  if exists (
    select 1 from public.early_cash_outs as early_exit
    where early_exit.game_id = input_game_id
      and early_exit.player_id = input_player_id
      and early_exit.status in ('requested', 'locked')
  ) then
    raise exception 'A requested or locked early cash-out prevents this player from returning.';
  end if;
  if found_player.left_at is null then return found_player; end if;

  select max_players_per_game into player_limit from public.app_config where id = true;
  if (
    select count(*) from public.players
    where game_id = input_game_id and left_at is null
  ) >= coalesce(player_limit, 12) then
    raise exception 'This game already has the maximum number of players.';
  end if;

  perform pg_catalog.set_config(
    'mainpot.restore_player_to_table',
    input_game_id::text || ':' || input_player_id::text,
    true
  );
  update public.players
  set left_at = null
  where id = input_player_id
  returning * into found_player;

  insert into public.game_events (
    game_id, event_type, actor_player_id, subject_player_id, metadata
  ) values (
    input_game_id, 'player_joined', active_host_id, found_player.id,
    jsonb_build_object(
      'player_name', found_player.name,
      'returned_to_table', true,
      'restored_by_host', true
    )
  );
  return found_player;
end;
$$;
revoke all on function mainpot_private.restore_player_to_table(uuid, uuid) from public;
grant execute on function mainpot_private.restore_player_to_table(uuid, uuid) to authenticated;
