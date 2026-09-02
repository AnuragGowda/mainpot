-- An advance is an outstanding debt attached to the player receiving chips.
-- Keep both the borrower and lender inside the same game, and never use the
-- funding field to represent a player's own ordinary payment.
alter table public.players
  add constraint players_id_game_id_key unique (id, game_id);

alter table public.buy_ins
  add constraint buy_ins_player_same_game_fkey
  foreign key (player_id, game_id)
  references public.players (id, game_id)
  not valid;

alter table public.buy_ins
  add constraint buy_ins_advance_player_same_game_fkey
  foreign key (fronted_by_player_id, game_id)
  references public.players (id, game_id)
  not valid;

alter table public.buy_ins
  add constraint buy_ins_advance_is_other_player_check
  check (
    fronted_by_player_id is null
    or fronted_by_player_id is distinct from player_id
  ) not valid;

create index if not exists buy_ins_player_game_idx
  on public.buy_ins (player_id, game_id);
create index if not exists buy_ins_advance_player_game_idx
  on public.buy_ins (fronted_by_player_id, game_id)
  where fronted_by_player_id is not null;

-- Preserve repayment history after the outstanding lender reference is
-- cleared from the mutable buy-in row.
alter table public.game_events
  drop constraint if exists game_events_event_type_check;
alter table public.game_events
  add constraint game_events_event_type_check check (event_type in (
    'game_created', 'player_joined', 'buy_in_added', 'buy_in_updated',
    'buy_in_advance_repaid', 'buy_in_removed', 'buy_in_verified',
    'player_left', 'player_removed', 'host_transferred', 'cash_out_updated',
    'game_settling', 'game_finalized', 'host_returned_to_create',
    'discrepancy_allocated'
  ));
