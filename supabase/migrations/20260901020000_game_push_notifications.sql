-- Per-device Web Push subscriptions and server-only delivery deduplication.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 12 and 2048),
  p256dh text not null check (char_length(p256dh) between 8 and 512),
  auth text not null check (char_length(auth) between 8 and 512),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

drop policy if exists "users read own push subscriptions" on public.push_subscriptions;
create policy "users read own push subscriptions" on public.push_subscriptions
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "users create own push subscriptions" on public.push_subscriptions;
create policy "users create own push subscriptions" on public.push_subscriptions
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "users update own push subscriptions" on public.push_subscriptions;
create policy "users update own push subscriptions" on public.push_subscriptions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users delete own push subscriptions" on public.push_subscriptions;
create policy "users delete own push subscriptions" on public.push_subscriptions
  for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- This table is intentionally server-only. A unique claim prevents a client
-- retry from sending the same game transition more than once.
create table if not exists public.push_dispatches (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  event_type text not null check (event_type in (
    'player_joined', 'game_settling', 'game_finalized'
  )),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 128),
  created_at timestamptz not null default now(),
  unique(game_id, dedupe_key)
);
alter table public.push_dispatches enable row level security;
revoke all on public.push_dispatches from anon, authenticated;

-- Keep account exports complete without exposing any other user's endpoint.
create or replace function public.export_my_mainpot_data()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'templates', coalesce((select jsonb_agg(to_jsonb(t) order by t.updated_at desc) from public.game_templates t where t.user_id = auth.uid()), '[]'::jsonb),
    'games_hosted', coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at desc) from public.games g where g.host_user_id = auth.uid()), '[]'::jsonb),
    'participation', coalesce((select jsonb_agg(to_jsonb(gp) order by gp.created_at desc) from public.game_participants gp where gp.user_id = auth.uid()), '[]'::jsonb),
    'friendships', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at desc) from public.friendships f where f.requester_id = auth.uid() or f.addressee_id = auth.uid()), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc) from public.game_invites i where i.inviter_id = auth.uid() or i.invitee_id = auth.uid()), '[]'::jsonb),
    'feedback', coalesce((select jsonb_agg(to_jsonb(gf) order by gf.created_at desc) from public.game_feedback gf join public.players p on p.id = gf.player_id where p.user_id = auth.uid()), '[]'::jsonb),
    'push_subscriptions', coalesce((select jsonb_agg(to_jsonb(ps) order by ps.updated_at desc) from public.push_subscriptions ps where ps.user_id = auth.uid()), '[]'::jsonb)
  );
$$;
revoke all on function public.export_my_mainpot_data() from public;
grant execute on function public.export_my_mainpot_data() to authenticated;
