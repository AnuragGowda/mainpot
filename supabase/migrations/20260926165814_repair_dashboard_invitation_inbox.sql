-- Production repair: restore the dashboard RPC without changing unrelated policies.
-- Idempotent with the earlier audit migration; exposes metadata only to its invitee.
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


notify pgrst, 'reload schema';
