-- Recurring-game templates and account-data controls for permanent accounts.
create table if not exists public.game_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  game_name text not null check (char_length(trim(game_name)) between 1 and 80),
  buy_in_amount numeric(10,2) not null check (buy_in_amount > 0),
  preferred_roster text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists game_templates_user_updated_idx
  on public.game_templates(user_id, updated_at desc);
alter table public.game_templates enable row level security;
create policy "users manage own game templates" on public.game_templates
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'cancelled')),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.account_deletion_requests enable row level security;
create policy "users create own deletion request" on public.account_deletion_requests
  for insert to authenticated with check (auth.uid() = user_id);
create policy "users read own deletion request" on public.account_deletion_requests
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.request_account_deletion()
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.account_deletion_requests;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, true) then
    raise exception 'A permanent account is required.';
  end if;

  insert into public.account_deletion_requests (user_id, status, requested_at, updated_at)
  values (auth.uid(), 'pending', now(), now())
  on conflict (user_id) do update set
    status = 'pending', requested_at = now(), updated_at = now()
  returning * into result;
  return result;
end;
$$;
revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;

-- Staff can fulfill a pending request by deleting the user in the Supabase
-- dashboard or Admin API. This function gives the account holder a portable
-- copy without exposing any other user's profile or payment details.
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
    'feedback', coalesce((select jsonb_agg(to_jsonb(gf) order by gf.created_at desc) from public.game_feedback gf join public.players p on p.id = gf.player_id where p.user_id = auth.uid()), '[]'::jsonb)
  );
$$;
revoke all on function public.export_my_mainpot_data() from public;
grant execute on function public.export_my_mainpot_data() to authenticated;
