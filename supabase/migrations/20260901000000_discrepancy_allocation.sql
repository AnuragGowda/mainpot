-- Preserve the table's explicit decision when cash-outs and buy-ins differ.
alter table public.games
  add column if not exists discrepancy_allocation jsonb;

alter table public.game_events
  drop constraint if exists game_events_event_type_check;
alter table public.game_events
  add constraint game_events_event_type_check check (event_type in (
    'game_created', 'player_joined', 'buy_in_added', 'buy_in_updated',
    'buy_in_removed', 'buy_in_verified', 'player_left', 'player_removed',
    'host_transferred', 'cash_out_updated', 'game_settling', 'game_finalized',
    'host_returned_to_create', 'discrepancy_allocated'
  ));
