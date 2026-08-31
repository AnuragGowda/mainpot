-- Beta feedback and lightweight acquisition attribution.
alter table public.games add column if not exists acquisition_source text
  check (acquisition_source is null or acquisition_source in ('personal_invite', 'poker_group', 'search', 'other'));

alter table public.game_events drop constraint if exists game_events_event_type_check;
alter table public.game_events add constraint game_events_event_type_check check (event_type in (
  'game_created', 'player_joined', 'buy_in_added', 'buy_in_updated',
  'buy_in_removed', 'buy_in_verified', 'player_left', 'player_removed',
  'host_transferred', 'cash_out_updated', 'game_settling', 'game_finalized',
  'host_returned_to_create'
));

create table if not exists public.game_feedback (
  id uuid default gen_random_uuid() primary key,
  game_id uuid not null references public.games on delete cascade,
  player_id uuid references public.players on delete set null,
  score integer not null check (score between 1 and 5),
  confusing text,
  created_at timestamptz not null default now()
);
create index if not exists game_feedback_game_idx on public.game_feedback(game_id, created_at desc);
alter table public.game_feedback enable row level security;
create policy "feedback append by participants" on public.game_feedback
  for insert to authenticated with check (public.is_game_participant(game_id));
create policy "feedback read by participants" on public.game_feedback
  for select to authenticated using (public.is_game_participant(game_id));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'game_feedback') then
    alter publication supabase_realtime add table game_feedback;
  end if;
end $$;
