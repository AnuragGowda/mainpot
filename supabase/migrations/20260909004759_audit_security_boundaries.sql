-- Bind activity references to the event's game. Keep direct appends for the
-- existing actor/host flows, but do not let a player from one game write into
-- another game's audit history.
drop policy if exists "events append by participants" on public.game_events;
drop policy if exists "events append by matching actor or host" on public.game_events;
create policy "events append by matching actor or host" on public.game_events
  for insert to authenticated
  with check (
    (actor_player_id is null or exists (
      select 1 from public.players as actor
      where actor.id = game_events.actor_player_id
        and actor.game_id = game_events.game_id
    ))
    and (subject_player_id is null or exists (
      select 1 from public.players as subject
      where subject.id = game_events.subject_player_id
        and subject.game_id = game_events.game_id
    ))
    and (
      public.is_game_host(game_id)
      or exists (
        select 1 from public.players as actor
        where actor.id = game_events.actor_player_id
          and actor.game_id = game_events.game_id
          and actor.user_id = auth.uid()
      )
    )
  );

-- The event ledger remains append-only for Data API callers.
revoke update, delete on table public.game_events from anon, authenticated;

-- A friendship may only be born pending. Its relationship endpoints are never
-- mutable through the Data API; response transitions are handled below.
-- NOT VALID enforces these checks for all new writes without letting malformed
-- legacy rows block rollout. Audit old rows before validating the constraints.
alter table public.friendships
  drop constraint if exists friendships_status_check;
alter table public.friendships
  add constraint friendships_status_check
  check (status in ('pending', 'accepted', 'declined')) not valid;
alter table public.friendships
  drop constraint if exists friendships_distinct_members_check;
alter table public.friendships
  add constraint friendships_distinct_members_check
  check (requester_id <> addressee_id) not valid;

drop policy if exists "friendships insert own" on public.friendships;
create policy "friendships create pending own" on public.friendships
  for insert to authenticated
  with check (
    auth.uid() = requester_id
    and requester_id <> addressee_id
    and status = 'pending'
    and responded_at is null
  );

drop policy if exists "friendships update own" on public.friendships;
revoke update on table public.friendships from anon, authenticated;

create or replace function mainpot_private.respond_to_friend_request(
  input_friendship_id uuid,
  input_status text
) returns public.friendships
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.friendships;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if input_status not in ('accepted', 'declined') then
    raise exception 'A friend request may only be accepted or declined';
  end if;

  update public.friendships
  set status = input_status,
      responded_at = now()
  where id = input_friendship_id
    and addressee_id = auth.uid()
    and status = 'pending'
  returning * into result;

  if not found then
    raise exception 'Only the recipient may answer a pending friend request';
  end if;
  return result;
end;
$$;
revoke all on function mainpot_private.respond_to_friend_request(uuid, text) from public;
grant execute on function mainpot_private.respond_to_friend_request(uuid, text) to authenticated;

create or replace function public.respond_to_friend_request(
  input_friendship_id uuid,
  input_status text
) returns public.friendships
language sql
security invoker
set search_path = ''
as $$
  select mainpot_private.respond_to_friend_request(input_friendship_id, input_status);
$$;
revoke all on function public.respond_to_friend_request(uuid, text) from public;
grant execute on function public.respond_to_friend_request(uuid, text) to authenticated;

-- The invitation inbox intentionally returns a small display projection. A
-- pending invitation does not itself grant any ledger access or expose a room
-- code; accepted invitations receive access and the redirect code atomically.
create or replace function mainpot_private.get_my_incoming_game_invites()
returns table (
  id uuid,
  game_id uuid,
  inviter_id uuid,
  invitee_id uuid,
  status text,
  created_at timestamptz,
  responded_at timestamptz,
  game jsonb,
  inviter jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    invite.id,
    invite.game_id,
    invite.inviter_id,
    invite.invitee_id,
    invite.status,
    invite.created_at,
    invite.responded_at,
    jsonb_build_object(
      'id', game.id,
      'name', game.name,
      'buy_in_amount', game.buy_in_amount,
      'host_name', game.host_name,
      'status', game.status
    ),
    jsonb_build_object(
      'id', inviter.id,
      'username', inviter.username,
      'display_name', inviter.display_name,
      'avatar_url', inviter.avatar_url
    )
  from public.game_invites as invite
  join public.games as game on game.id = invite.game_id
  join public.profiles as inviter on inviter.id = invite.inviter_id
  where invite.invitee_id = auth.uid()
    and invite.status = 'pending'
    and game.status = 'active'
    and (game.expires_at is null or game.expires_at > now())
  order by invite.created_at desc;
$$;
revoke all on function mainpot_private.get_my_incoming_game_invites() from public;
grant execute on function mainpot_private.get_my_incoming_game_invites() to authenticated;

create or replace function public.get_my_incoming_game_invites()
returns table (
  id uuid,
  game_id uuid,
  inviter_id uuid,
  invitee_id uuid,
  status text,
  created_at timestamptz,
  responded_at timestamptz,
  game jsonb,
  inviter jsonb
)
language sql
security invoker
set search_path = ''
as $$
  select * from mainpot_private.get_my_incoming_game_invites();
$$;
revoke all on function public.get_my_incoming_game_invites() from public;
grant execute on function public.get_my_incoming_game_invites() to authenticated;

create or replace function mainpot_private.respond_to_game_invite(
  input_invite_id uuid,
  input_status text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.game_invites;
  game public.games;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if input_status not in ('accepted', 'declined') then
    raise exception 'An invitation may only be accepted or declined';
  end if;

  select * into invite
  from public.game_invites
  where id = input_invite_id
    and invitee_id = auth.uid()
    and status = 'pending';
  if not found then
    raise exception 'Only the invitee may answer a pending invitation';
  end if;

  select * into game from public.games where id = invite.game_id for update;
  if not found then
    raise exception 'Game not found';
  end if;
  -- Match send_game_invite's game-then-invitation lock order. Recheck the
  -- pending row after waiting so concurrent responses cannot grant access twice.
  select * into invite from public.game_invites
  where id = input_invite_id and invitee_id = auth.uid() and status = 'pending'
  for update;
  if not found then raise exception 'This invitation has already been answered'; end if;

  if input_status = 'accepted'
    and (game.status <> 'active' or (game.expires_at is not null and game.expires_at <= now())) then
    raise exception 'This game is no longer accepting players';
  end if;

  update public.game_invites
  set status = input_status,
      responded_at = now()
  where id = invite.id;

  if input_status = 'accepted' then
    insert into public.game_access(game_id, user_id)
    values (game.id, auth.uid())
    on conflict on constraint game_access_pkey
    do update set granted_at = now();
    return game.code;
  end if;
  return null;
end;
$$;
revoke all on function mainpot_private.respond_to_game_invite(uuid, text) from public;
grant execute on function mainpot_private.respond_to_game_invite(uuid, text) to authenticated;

create or replace function public.respond_to_game_invite(
  input_invite_id uuid,
  input_status text
) returns text
language sql
security invoker
set search_path = ''
as $$
  select mainpot_private.respond_to_game_invite(input_invite_id, input_status);
$$;
revoke all on function public.respond_to_game_invite(uuid, text) from public;
grant execute on function public.respond_to_game_invite(uuid, text) to authenticated;

-- Re-sending a declined invitation is an explicit host action. Pending and
-- accepted invitations cannot be silently overwritten.
create or replace function mainpot_private.send_game_invite(
  input_game_id uuid,
  input_invitee_id uuid
) returns public.game_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  game public.games;
  existing_invite public.game_invites;
  result public.game_invites;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if input_invitee_id is null or input_invitee_id = auth.uid() then
    raise exception 'Choose another player to invite';
  end if;

  select * into game from public.games where id = input_game_id for update;
  if not found or game.host_user_id is distinct from auth.uid() then
    raise exception 'Only the host can invite players';
  end if;
  if game.status <> 'active' or (game.expires_at is not null and game.expires_at <= now()) then
    raise exception 'This game is no longer accepting players';
  end if;

  select * into existing_invite
  from public.game_invites
  where game_id = input_game_id and invitee_id = input_invitee_id
  for update;

  if found then
    if existing_invite.status = 'declined' then
      update public.game_invites
      set inviter_id = auth.uid(),
          status = 'pending',
          created_at = now(),
          responded_at = null
      where id = existing_invite.id
      returning * into result;
      return result;
    end if;
    if existing_invite.status = 'pending' then
      raise exception 'This player already has a pending invitation';
    end if;
    raise exception 'This player already accepted the invitation';
  end if;

  insert into public.game_invites(game_id, inviter_id, invitee_id)
  values (input_game_id, auth.uid(), input_invitee_id)
  returning * into result;
  return result;
end;
$$;
revoke all on function mainpot_private.send_game_invite(uuid, uuid) from public;
grant execute on function mainpot_private.send_game_invite(uuid, uuid) to authenticated;

create or replace function public.send_game_invite(
  input_game_id uuid,
  input_invitee_id uuid
) returns public.game_invites
language sql
security invoker
set search_path = ''
as $$
  select mainpot_private.send_game_invite(input_game_id, input_invitee_id);
$$;
revoke all on function public.send_game_invite(uuid, uuid) from public;
grant execute on function public.send_game_invite(uuid, uuid) to authenticated;

drop policy if exists "game invites created by host" on public.game_invites;
drop policy if exists "game invites answered by invitee" on public.game_invites;
drop policy if exists "game invites cancelled by inviter" on public.game_invites;
create policy "game invites cancelled by host" on public.game_invites
  for delete to authenticated
  using (auth.uid() = inviter_id and status = 'pending');
revoke insert, update on table public.game_invites from anon, authenticated;
