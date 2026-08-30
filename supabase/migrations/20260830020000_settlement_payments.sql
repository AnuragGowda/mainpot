-- Track settlement completion without changing the game ledger.
create table if not exists settlement_payments (
  id uuid default gen_random_uuid() primary key,
  game_id uuid not null references games on delete cascade,
  from_player_id uuid not null references players on delete cascade,
  to_player_id uuid not null references players on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  mode text not null check (mode in ('min', 'bank')),
  settled boolean not null default false,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(game_id, from_player_id, to_player_id, amount, mode),
  check(from_player_id <> to_player_id)
);

alter table settlement_payments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'settlement_payments'
  ) then
    alter publication supabase_realtime add table settlement_payments;
  end if;
end $$;

create policy "settlement payments read by participants" on settlement_payments
  for select to authenticated using (public.is_game_participant(game_id));
create policy "settlement payments created by parties or host" on settlement_payments
  for insert to authenticated with check (
    public.owns_player(from_player_id) or public.owns_player(to_player_id) or public.is_game_host(game_id)
  );
create policy "settlement payments updated by parties or host" on settlement_payments
  for update to authenticated using (
    public.owns_player(from_player_id) or public.owns_player(to_player_id) or public.is_game_host(game_id)
  ) with check (
    public.owns_player(from_player_id) or public.owns_player(to_player_id) or public.is_game_host(game_id)
  );
