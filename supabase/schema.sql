-- Games table
create table games (
  id uuid default gen_random_uuid() primary key,
  code varchar(6) unique not null,
  name text not null,
  host_session_id text not null,
  host_name text not null,
  buy_in_amount numeric(10,2) not null,
  status text not null default 'active',
  created_at timestamptz default now(),
  ended_at timestamptz
);
alter table games add column if not exists acquisition_source text
  check (acquisition_source is null or acquisition_source in ('personal_invite', 'poker_group', 'search', 'other'));
alter table games add column if not exists discrepancy_allocation jsonb;
-- Players table
create table players (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references games on delete cascade,
  session_id text not null,
  name text not null,
  is_host boolean default false,
  joined_at timestamptz default now(),
  left_at timestamptz,
  unique(game_id, session_id)
);
-- Buy-ins table
create table buy_ins (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references games on delete cascade,
  player_id uuid references players on delete cascade,
  amount numeric(10,2) not null,
  type text not null default 'buy_in',
  fronted_by_player_id uuid references players on delete set null,
  verified boolean default false,
  created_at timestamptz default now()
);
-- Cash-outs table
create table cash_outs (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references games on delete cascade,
  player_id uuid references players on delete cascade,
  amount numeric(10,2) not null,
  created_at timestamptz default now()
);

alter publication supabase_realtime add table games, players, buy_ins, cash_outs;

alter table games enable row level security;
alter table players enable row level security;
alter table buy_ins enable row level security;
alter table cash_outs enable row level security;

create policy "public access" on games for all using (true) with check (true);
create policy "public access" on players for all using (true) with check (true);
create policy "public access" on buy_ins for all using (true) with check (true);
create policy "public access" on cash_outs for all using (true) with check (true);

-- ============================================================================
-- Authentication & social layer (Wave 2 — additive only)
-- The tables below (profiles, friendships, game_participants) require
-- authentication, unlike the public Wave 1 tables above. RLS policies here
-- scope reads/writes to authenticated users.
-- ============================================================================

-- Link anonymous/local players to authenticated users (nullable: anonymous
-- players have no user_id).
alter table players add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table games add column if not exists host_user_id uuid references auth.users(id) on delete set null;

-- Helpful for the game-ended trigger below and user->player lookups.
create index if not exists players_user_id_idx on players(user_id);

-- Per-user public profile, created automatically by handle_new_user trigger.
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  display_name text,
  avatar_url text,
  venmo_handle text,
  zelle_handle text,
  bio text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Friend graph between authenticated users.
create table if not exists friendships (
  id uuid default gen_random_uuid() primary key,
  requester_id uuid references profiles on delete cascade,
  addressee_id uuid references profiles on delete cascade,
  status text not null default 'pending',
  created_at timestamptz default now(),
  responded_at timestamptz,
  unique(requester_id, addressee_id)
);

-- Per-user participation + net result for a game, written by the
-- handle_game_ended trigger when a game is marked ended.
create table if not exists game_participants (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references games on delete cascade,
  user_id uuid references profiles on delete cascade,
  player_id uuid references players on delete cascade,
  net_result numeric(10,2),
  created_at timestamptz default now(),
  unique(game_id, user_id)
);

-- Immutable activity ledger. Mutable game records remain efficient to query,
-- while this table preserves the human-readable audit trail.
create table if not exists game_events (
  id uuid default gen_random_uuid() primary key,
  game_id uuid not null references games on delete cascade,
  event_type text not null check (event_type in (
    'game_created', 'player_joined', 'buy_in_added', 'buy_in_updated',
    'buy_in_removed', 'buy_in_verified', 'player_left', 'player_removed',
    'cash_out_updated', 'game_settling', 'game_finalized', 'host_returned_to_create',
    'discrepancy_allocated'
  )),
  actor_player_id uuid references players on delete set null,
  subject_player_id uuid references players on delete set null,
  amount numeric(10,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists game_events_game_created_idx
  on game_events(game_id, created_at);

create table if not exists game_feedback (
  id uuid default gen_random_uuid() primary key,
  game_id uuid not null references games on delete cascade,
  player_id uuid references players on delete set null,
  score integer not null check (score between 1 and 5),
  confusing text,
  created_at timestamptz not null default now()
);
alter table game_feedback enable row level security;

create table if not exists push_subscriptions (
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
  on push_subscriptions(user_id);
alter table push_subscriptions enable row level security;

create table if not exists push_dispatches (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  event_type text not null check (event_type in (
    'player_joined', 'game_settling', 'game_finalized'
  )),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 128),
  created_at timestamptz not null default now(),
  unique(game_id, dedupe_key)
);
alter table push_dispatches enable row level security;

-- Append-only, server-written Product Ops events. A private collector reads
-- these by sequence, while browser-facing database roles receive no access.
create table if not exists product_ops_outbox (
  sequence bigint generated always as identity primary key,
  environment text not null check (environment in ('development', 'staging', 'production')),
  event_name text not null check (char_length(event_name) between 1 and 128),
  occurred_at timestamptz not null,
  actor_id text not null check (char_length(actor_id) between 1 and 128),
  session_id text not null check (char_length(session_id) between 1 and 128),
  journey_id text,
  properties jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique check (char_length(idempotency_key) between 1 and 128),
  received_at timestamptz not null default now()
);
create index if not exists product_ops_outbox_environment_sequence_idx
  on product_ops_outbox (environment, sequence);
create index if not exists product_ops_outbox_received_at_idx
  on product_ops_outbox (received_at);
alter table product_ops_outbox enable row level security;

-- A server-only probe table exercises database and Realtime health without
-- mutating customer games.
create table if not exists product_ops_canary (
  probe_id uuid primary key,
  created_at timestamptz not null default now()
);
alter table product_ops_canary enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_events'
  ) then
    alter publication supabase_realtime add table game_events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'product_ops_canary'
  ) then
    alter publication supabase_realtime add table product_ops_canary;
  end if;
end $$;

alter table profiles enable row level security;
alter table friendships enable row level security;
alter table game_participants enable row level security;
alter table game_events enable row level security;

create policy "users read own push subscriptions" on push_subscriptions
  for select to authenticated using (auth.uid() = user_id);
create policy "users create own push subscriptions" on push_subscriptions
  for insert to authenticated with check (auth.uid() = user_id);
create policy "users update own push subscriptions" on push_subscriptions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users delete own push subscriptions" on push_subscriptions
  for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on push_subscriptions to authenticated;
revoke all on push_dispatches from anon, authenticated;
revoke all on product_ops_outbox from anon, authenticated, service_role;
revoke all on sequence product_ops_outbox_sequence_seq from anon, authenticated, service_role;
grant select, insert on product_ops_outbox to service_role;
grant usage on sequence product_ops_outbox_sequence_seq to service_role;
revoke all on product_ops_canary from anon, authenticated, service_role;
grant select, insert, delete on product_ops_canary to service_role;

-- Replace the prototype's public-write policies. Anonymous Supabase users are
-- still role `authenticated`, so guests can join without creating an account.
drop policy if exists "public access" on games;
drop policy if exists "public access" on players;
drop policy if exists "public access" on buy_ins;
drop policy if exists "public access" on cash_outs;

-- Security-definer membership checks avoid recursive RLS evaluation when a
-- players policy needs to ask whether the caller belongs to the same game.
create or replace function public.is_game_participant(target_game_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from players
    where game_id = target_game_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_game_host(target_game_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from games
    where id = target_game_id and host_user_id = auth.uid()
  );
$$;

create or replace function public.owns_player(target_player_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from players
    where id = target_player_id and user_id = auth.uid()
  );
$$;

create or replace function public.game_has_status(target_game_id uuid, target_status text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from games
    where id = target_game_id and status = target_status
  );
$$;

revoke all on function public.is_game_participant(uuid) from public;
revoke all on function public.is_game_host(uuid) from public;
revoke all on function public.owns_player(uuid) from public;
revoke all on function public.game_has_status(uuid, text) from public;
grant execute on function public.is_game_participant(uuid) to authenticated;
grant execute on function public.is_game_host(uuid) to authenticated;
grant execute on function public.owns_player(uuid) to authenticated;
grant execute on function public.game_has_status(uuid, text) to authenticated;

create policy "games read by code" on games for select to authenticated using (true);
create policy "games create as host" on games for insert to authenticated
  with check (auth.uid() = host_user_id);
create policy "games host update" on games for update to authenticated
  using (auth.uid() = host_user_id) with check (auth.uid() = host_user_id);
create policy "games host delete" on games for delete to authenticated
  using (auth.uid() = host_user_id);

create policy "players read same game" on players for select to authenticated
  using (auth.uid() = user_id or public.is_game_participant(game_id));
create policy "players join as self" on players for insert to authenticated
  with check (auth.uid() = user_id and public.game_has_status(game_id, 'active'));
create policy "players self or host update" on players for update to authenticated
  using (public.game_has_status(game_id, 'active') and (auth.uid() = user_id or public.is_game_host(game_id)))
  with check (public.game_has_status(game_id, 'active') and (auth.uid() = user_id or public.is_game_host(game_id)));
create policy "players self or host delete" on players for delete to authenticated
  using (public.game_has_status(game_id, 'active') and (auth.uid() = user_id or public.is_game_host(game_id)));

create policy "buy ins read by participants" on buy_ins for select to authenticated
  using (public.is_game_participant(game_id));
create policy "buy ins create by player or host" on buy_ins for insert to authenticated
  with check (public.game_has_status(game_id, 'active') and (public.owns_player(player_id) or public.is_game_host(game_id)));
create policy "buy ins update by player or host" on buy_ins for update to authenticated
  using (public.game_has_status(game_id, 'active') and (public.owns_player(player_id) or public.is_game_host(game_id)))
  with check (public.game_has_status(game_id, 'active') and (public.owns_player(player_id) or public.is_game_host(game_id)));
create policy "buy ins delete by player or host" on buy_ins for delete to authenticated
  using (public.game_has_status(game_id, 'active') and (public.owns_player(player_id) or public.is_game_host(game_id)));

create policy "cash outs read by participants" on cash_outs for select to authenticated
  using (public.is_game_participant(game_id));
create policy "cash outs create by player or host" on cash_outs for insert to authenticated
  with check (public.game_has_status(game_id, 'settling') and (public.owns_player(player_id) or public.is_game_host(game_id)));
create policy "cash outs update by player or host" on cash_outs for update to authenticated
  using (public.game_has_status(game_id, 'settling') and (public.owns_player(player_id) or public.is_game_host(game_id)))
  with check (public.game_has_status(game_id, 'settling') and (public.owns_player(player_id) or public.is_game_host(game_id)));

create policy "events read by participants" on game_events for select to authenticated
  using (public.is_game_participant(game_id));
create policy "events append by participants" on game_events for insert to authenticated
  with check (
    public.owns_player(actor_player_id) or public.is_game_host(game_id)
  );

-- profiles: anyone authenticated may read; each user manages their own row.
create policy "profiles select" on profiles for select to authenticated using (true);
create policy "profiles insert own" on profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles update own" on profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles delete own" on profiles for delete to authenticated using (auth.uid() = id);

-- friendships: users only see/affect rows they are a party to.
create policy "friendships select" on friendships for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "friendships insert own" on friendships for insert to authenticated
  with check (auth.uid() = requester_id);
create policy "friendships update own" on friendships for update to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "friendships delete own" on friendships for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- game_participants: any authenticated user may read; each user manages
-- their own participation rows.
create policy "game_participants select" on game_participants for select to authenticated using (true);
create policy "game_participants insert own" on game_participants for insert to authenticated with check (auth.uid() = user_id);
create policy "game_participants update own" on game_participants for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "game_participants delete own" on game_participants for delete to authenticated using (auth.uid() = user_id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- When a game is marked ended, record each authenticated player's net result.
create or replace function public.handle_game_ended()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ended' and old.status is distinct from 'ended' then
    insert into public.game_participants (game_id, user_id, player_id, net_result)
    select
      new.id,
      p.user_id,
      p.id,
      coalesce(
        (select sum(amount) from cash_outs c where c.player_id = p.id),
        0
      ) - coalesce(
        (select sum(amount) from buy_ins b where b.player_id = p.id),
        0
      )
    from players p
    where p.game_id = new.id
      and p.user_id is not null
    on conflict (game_id, user_id)
    do update set
      net_result = excluded.net_result,
      player_id = excluded.player_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_game_ended on games;
create trigger on_game_ended
  after update on games
  for each row execute procedure public.handle_game_ended();

-- Retain pseudonymous Product Ops events for 90 days. The hosted Supabase
-- cron job is idempotently replaced when this schema is applied again.
create or replace function public.purge_expired_product_ops_outbox()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.product_ops_outbox
  where received_at < now() - interval '90 days';
$$;
revoke all on function public.purge_expired_product_ops_outbox()
  from public, anon, authenticated, service_role;

create extension if not exists pg_cron;
do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'purge-expired-product-ops-outbox';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
  perform cron.schedule(
    'purge-expired-product-ops-outbox',
    '41 3 * * *',
    'select public.purge_expired_product_ops_outbox()'
  );
end;
$$;
