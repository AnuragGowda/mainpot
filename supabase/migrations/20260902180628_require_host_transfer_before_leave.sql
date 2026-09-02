-- A live game always keeps an active host. The paired RPC updates host
-- ownership and the former host's departure in one transaction.
create or replace function public.transfer_game_host(
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

create or replace function public.transfer_host_and_leave_game(
  target_game_id uuid,
  target_player_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  departing_host_id uuid;
  departing_host_name text;
begin
  if not public.game_has_status(target_game_id, 'active') then
    raise exception 'You can only leave an active game';
  end if;
  if not public.is_game_host(target_game_id) then
    raise exception 'Only the host can transfer the table before leaving';
  end if;

  select id, name into departing_host_id, departing_host_name
  from public.players
  where game_id = target_game_id and is_host = true;

  perform public.transfer_game_host(target_game_id, target_player_id);

  update public.players
  set left_at = now()
  where id = departing_host_id;

  insert into public.game_events (
    game_id, event_type, actor_player_id, subject_player_id, metadata
  ) values (
    target_game_id, 'player_left', departing_host_id, departing_host_id,
    jsonb_build_object('player_name', departing_host_name)
  );
end;
$$;

create or replace function public.prevent_untransferred_host_leave()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_host is distinct from new.is_host
    and coalesce(current_setting('mainpot.host_transfer', true), '') <> 'true' then
    raise exception 'Host controls can only change through a host transfer';
  end if;

  if old.is_host and new.left_at is not null then
    raise exception 'Choose a new host before leaving the table';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_untransferred_host_leave on public.players;
create trigger prevent_untransferred_host_leave
before update on public.players
for each row execute function public.prevent_untransferred_host_leave();

revoke all on function public.transfer_game_host(uuid, uuid) from public;
grant execute on function public.transfer_game_host(uuid, uuid) to authenticated;
revoke all on function public.transfer_host_and_leave_game(uuid, uuid) from public;
grant execute on function public.transfer_host_and_leave_game(uuid, uuid) to authenticated;
