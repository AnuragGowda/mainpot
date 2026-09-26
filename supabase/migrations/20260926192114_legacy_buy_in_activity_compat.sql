-- Cached older clients append activity after this RPC's authoritative event.
-- A matching append remains successful without adding a second activity row.
create index if not exists buy_in_activity_identity_idx
on public.game_events (game_id, subject_player_id, (metadata ->> 'buy_in_id'), amount)
where event_type = 'buy_in_added';

create or replace function mainpot_private.ignore_legacy_duplicate_buy_in_added()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.event_type <> 'buy_in_added'
    or new.actor_player_id is null or new.subject_player_id is null or new.amount is null
    or coalesce(jsonb_typeof(new.metadata -> 'buy_in_id'), '') <> 'string' then
    return new;
  end if;
  -- Suppression must not turn an unauthorized append into apparent success.
  -- Mirror the existing insert policy before returning a suppressed row.
  if not exists (
    select 1 from public.players actor
    where actor.id = new.actor_player_id and actor.game_id = new.game_id
      and (actor.user_id = auth.uid() or public.is_game_host(new.game_id))
  ) or not exists (
    select 1 from public.players subject
    where subject.id = new.subject_player_id and subject.game_id = new.game_id
  ) then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended('buy-in-activity:' || (new.metadata ->> 'buy_in_id'), 0));
  if exists (
    select 1 from public.game_events canonical
    where canonical.game_id = new.game_id and canonical.event_type = 'buy_in_added'
      and canonical.subject_player_id = new.subject_player_id and canonical.amount = new.amount
      and canonical.metadata ->> 'buy_in_id' = new.metadata ->> 'buy_in_id'
  ) then return null; end if;
  return new;
end;
$$;
revoke all on function mainpot_private.ignore_legacy_duplicate_buy_in_added() from public, anon, authenticated;
alter function mainpot_private.ignore_legacy_duplicate_buy_in_added() owner to postgres;

drop trigger if exists "00_ignore_legacy_duplicate_buy_in_added" on public.game_events;
create trigger "00_ignore_legacy_duplicate_buy_in_added"
before insert on public.game_events
for each row execute function mainpot_private.ignore_legacy_duplicate_buy_in_added();
