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