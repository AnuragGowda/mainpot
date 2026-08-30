-- Host handoff and direct invitations for a user's regular poker group.

alter table game_events drop constraint if exists game_events_event_type_check;
alter table game_events add constraint game_events_event_type_check check (event_type in (
  'game_created', 'player_joined', 'buy_in_added', 'buy_in_updated',
  'buy_in_removed', 'buy_in_verified', 'player_left', 'player_removed',
  'host_transferred', 'cash_out_updated', 'game_settling', 'game_finalized'
));

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
  next_host players%rowtype;
begin
  if not public.is_game_host(target_game_id) then
    raise exception 'Only the host can transfer the table';
  end if;

  select id into previous_host_id
  from players
  where game_id = target_game_id and is_host = true
  limit 1;

  select * into next_host
  from players
  where id = target_player_id
    and game_id = target_game_id
    and left_at is null;

  if not found then
    raise exception 'That player is no longer at the table';
  end if;

  update players
  set is_host = (id = target_player_id)
  where game_id = target_game_id;

  update games
  set host_user_id = next_host.user_id,
      host_session_id = next_host.session_id,
      host_name = next_host.name
  where id = target_game_id;

  insert into game_events (
    game_id, event_type, actor_player_id, subject_player_id, metadata
  ) values (
    target_game_id,
    'host_transferred',
    previous_host_id,
    target_player_id,
    jsonb_build_object('player_name', next_host.name)
  );
end;
$$;

revoke all on function public.transfer_game_host(uuid, uuid) from public;
grant execute on function public.transfer_game_host(uuid, uuid) to authenticated;

create table if not exists game_invites (
  id uuid default gen_random_uuid() primary key,
  game_id uuid not null references games on delete cascade,
  inviter_id uuid not null references profiles on delete cascade,
  invitee_id uuid not null references profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(game_id, invitee_id),
  check(inviter_id <> invitee_id)
);

create index if not exists game_invites_invitee_status_idx
  on game_invites(invitee_id, status, created_at desc);

alter table game_invites enable row level security;

create policy "game invites visible to both parties" on game_invites
  for select to authenticated
  using (auth.uid() = inviter_id or auth.uid() = invitee_id);

create policy "game invites created by host" on game_invites
  for insert to authenticated
  with check (auth.uid() = inviter_id and public.is_game_host(game_id));

create policy "game invites answered by invitee" on game_invites
  for update to authenticated
  using (auth.uid() = invitee_id)
  with check (auth.uid() = invitee_id);

create policy "game invites cancelled by inviter" on game_invites
  for delete to authenticated
  using (auth.uid() = inviter_id);

