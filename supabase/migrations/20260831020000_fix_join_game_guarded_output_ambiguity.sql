-- `game_id` is an output column of this PL/pgSQL function. Qualifying the
-- players-table references prevents PostgreSQL from treating it as ambiguous.
create or replace function public.join_game_guarded(
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
  if char_length(input_session_id) not between 8 and 128 then raise exception 'Invalid browser session'; end if;

  select * into found_game from public.games
  where code = upper(trim(input_code)) and (expires_at is null or expires_at > now()) limit 1;
  if not found then raise exception 'Game not found.'; end if;
  if found_game.status = 'ended' then raise exception 'This game has already ended.'; end if;

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

revoke all on function public.join_game_guarded(text, text, text) from public;
grant execute on function public.join_game_guarded(text, text, text) to authenticated;
