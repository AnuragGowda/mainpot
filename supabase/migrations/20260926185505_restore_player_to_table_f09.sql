-- Restore an existing departed seat only with explicit approval from the
-- current host. The player's identity and ledger rows remain untouched.
create schema if not exists mainpot_private;
revoke all on schema mainpot_private from public;
grant usage on schema mainpot_private to authenticated;

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
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Serialize against game phase changes and other roster/ledger mutations.
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

  -- Lock the existing seat only after the game row to keep a stable lock order.
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

  -- Retry after an already successful return is a no-op and adds no second
  -- player_joined event.
  if found_player.left_at is null then
    return found_player;
  end if;

  select max_players_per_game into player_limit from public.app_config where id = true;
  if (
    select count(*) from public.players
    where game_id = input_game_id and left_at is null
  ) >= coalesce(player_limit, 12) then
    raise exception 'This game already has the maximum number of players.';
  end if;

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

create or replace function public.restore_player_to_table(
  input_game_id uuid,
  input_player_id uuid
) returns public.players
language sql
security invoker
set search_path = ''
as $$
  select mainpot_private.restore_player_to_table(input_game_id, input_player_id);
$$;
revoke all on function public.restore_player_to_table(uuid, uuid) from public, anon;
grant execute on function public.restore_player_to_table(uuid, uuid) to authenticated;
