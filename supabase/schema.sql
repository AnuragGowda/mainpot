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

alter table profiles enable row level security;
alter table friendships enable row level security;
alter table game_participants enable row level security;

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