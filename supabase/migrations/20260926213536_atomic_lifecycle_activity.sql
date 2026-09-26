-- Closing the active ledger and removing a seat both change the visible game
-- state and its activity history. Keep each pair in one transaction so an
-- audit failure cannot leave a completed mutation with a reported error.
create or replace function mainpot_private.start_settlement_guarded(
  input_game_id uuid
) returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_game public.games%rowtype;
  active_host public.players%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  -- Lock the game before its host seat, matching every lifecycle RPC.
  select * into found_game
  from public.games
  where id = input_game_id
  for update;
  if not found then raise exception 'Game not found.'; end if;
  if found_game.host_user_id is distinct from auth.uid() then
    raise exception 'Only the host can start cash-outs.';
  end if;
  if found_game.status <> 'active' then
    raise exception 'The active ledger is already closed.';
  end if;

  select * into active_host
  from public.players
  where game_id = input_game_id
    and is_host
    and user_id = auth.uid()
    and left_at is null
  for update;
  if not found then raise exception 'Only the active host can start cash-outs.'; end if;

  update public.games
  set status = 'settling', ended_at = now()
  where id = input_game_id
  returning * into found_game;

  insert into public.game_events (game_id, event_type, actor_player_id)
  values (input_game_id, 'game_settling', active_host.id);
  return found_game;
end;
$$;

revoke all on function mainpot_private.start_settlement_guarded(uuid) from public;
grant execute on function mainpot_private.start_settlement_guarded(uuid) to authenticated;

create or replace function public.start_settlement_guarded(
  input_game_id uuid
) returns public.games
language sql
security invoker
set search_path = ''
as $$
  select mainpot_private.start_settlement_guarded(input_game_id);
$$;

revoke all on function public.start_settlement_guarded(uuid) from public, anon;
grant execute on function public.start_settlement_guarded(uuid) to authenticated;

create or replace function mainpot_private.remove_player_guarded(
  input_game_id uuid,
  input_player_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_game public.games%rowtype;
  active_host public.players%rowtype;
  departing_player public.players%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  -- Keep the same game-then-player order as phase, restore, and ledger RPCs.
  select * into found_game
  from public.games
  where id = input_game_id
  for update;
  if not found then raise exception 'Game not found.'; end if;
  if found_game.host_user_id is distinct from auth.uid() then
    raise exception 'Only the active host can remove a player.';
  end if;
  if found_game.status <> 'active' then
    raise exception 'The active ledger is already closed.';
  end if;

  select * into active_host
  from public.players
  where game_id = input_game_id
    and is_host
    and user_id = auth.uid()
    and left_at is null
  for update;
  if not found then raise exception 'Only the active host can remove a player.'; end if;

  select * into departing_player
  from public.players
  where id = input_player_id and game_id = input_game_id
  for update;
  if not found then raise exception 'Player not found.'; end if;
  if departing_player.is_host then
    raise exception 'Transfer the host role and leave instead of deleting the host seat.';
  end if;

  -- The player FK on game_events deliberately turns subject_player_id null
  -- after the seat is deleted; metadata retains the removed name for history.
  insert into public.game_events (
    game_id, event_type, actor_player_id, subject_player_id, metadata
  ) values (
    input_game_id, 'player_removed', active_host.id, departing_player.id,
    jsonb_build_object('player_name', departing_player.name)
  );

  -- This fires the lobby-name release trigger and the existing ledger cascades.
  delete from public.players where id = departing_player.id;
end;
$$;

revoke all on function mainpot_private.remove_player_guarded(uuid, uuid) from public;
grant execute on function mainpot_private.remove_player_guarded(uuid, uuid) to authenticated;

create or replace function public.remove_player_guarded(
  input_game_id uuid,
  input_player_id uuid
) returns void
language sql
security invoker
set search_path = ''
as $$
  select mainpot_private.remove_player_guarded(input_game_id, input_player_id);
$$;

revoke all on function public.remove_player_guarded(uuid, uuid) from public, anon;
grant execute on function public.remove_player_guarded(uuid, uuid) to authenticated;

-- Direct deletes could bypass the audit row and lobby-name release transaction.
revoke delete on table public.players from public, anon, authenticated;

-- The remaining lifecycle decisions follow the same game-first lock order and
-- commit their activity record with the visible state transition.
create or replace function mainpot_private.finalize_settlement_guarded(input_game_id uuid, input_mode text, input_bank_player_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare g public.games%rowtype; host public.players%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into g from public.games where id=input_game_id for update;
 if not found or g.host_user_id is distinct from auth.uid() then raise exception 'Only the host can lock the settlement'; end if;
 if g.status <> 'settling' then raise exception 'Finalized games are read-only.'; end if;
 select * into host from public.players where game_id=input_game_id and is_host and user_id=auth.uid() and left_at is null for update;
 if not found then raise exception 'Only the active host can lock the settlement'; end if;
 update public.games set status='ended', ended_at=coalesce(ended_at, now()), settlement_mode=input_mode, settlement_bank_player_id=input_bank_player_id where id=input_game_id;
 insert into public.game_events(game_id,event_type,actor_player_id) values(input_game_id,'game_finalized',host.id);
end $$;
create or replace function public.finalize_settlement_guarded(input_game_id uuid, input_mode text, input_bank_player_id uuid)
returns void language sql security invoker set search_path='' as $$ select mainpot_private.finalize_settlement_guarded(input_game_id,input_mode,input_bank_player_id) $$;
revoke all on function public.finalize_settlement_guarded(uuid,text,uuid) from public,anon;
grant execute on function public.finalize_settlement_guarded(uuid,text,uuid) to authenticated;

create or replace function mainpot_private.save_discrepancy_allocation_guarded(input_game_id uuid, input_allocation jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare g public.games%rowtype; host public.players%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into g from public.games where id=input_game_id for update;
 if not found or g.host_user_id is distinct from auth.uid() then raise exception 'Only the host can save a discrepancy decision'; end if;
 if g.status <> 'settling' then raise exception 'Finalized games are read-only.'; end if;
 select * into host from public.players where game_id=input_game_id and is_host and user_id=auth.uid() and left_at is null for update;
 if not found then raise exception 'Only the active host can save a discrepancy decision'; end if;
 update public.games set discrepancy_allocation=input_allocation where id=input_game_id;
 insert into public.game_events(game_id,event_type,actor_player_id,amount,metadata) values(input_game_id,'discrepancy_allocated',host.id,(input_allocation->>'amount')::numeric,jsonb_build_object('method',input_allocation->>'method','player_count',jsonb_array_length(coalesce(input_allocation->'player_ids','[]'::jsonb))));
end $$;
create or replace function public.save_discrepancy_allocation_guarded(input_game_id uuid, input_allocation jsonb)
returns void language sql security invoker set search_path='' as $$ select mainpot_private.save_discrepancy_allocation_guarded(input_game_id,input_allocation) $$;
revoke all on function public.save_discrepancy_allocation_guarded(uuid,jsonb) from public,anon;
grant execute on function public.save_discrepancy_allocation_guarded(uuid,jsonb) to authenticated;

create or replace function mainpot_private.leave_game_guarded(input_game_id uuid, input_player_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare g public.games%rowtype; p public.players%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into g from public.games where id=input_game_id for update;
 if not found then raise exception 'Game not found.'; end if;
 if g.status <> 'active' then raise exception 'The active ledger is already closed.'; end if;
 select * into p from public.players where id=input_player_id and game_id=input_game_id for update;
 if not found or p.user_id is distinct from auth.uid() then raise exception 'Only the player can leave this seat.'; end if;
 if p.is_host then raise exception 'Transfer the host role before leaving.'; end if;
 if p.left_at is not null then return; end if;
 update public.players set left_at=now() where id=p.id;
 insert into public.game_events(game_id,event_type,actor_player_id,subject_player_id,metadata) values(input_game_id,'player_left',p.id,p.id,jsonb_build_object('player_name',p.name));
end $$;
create or replace function public.leave_game_guarded(input_game_id uuid, input_player_id uuid)
returns void language sql security invoker set search_path='' as $$ select mainpot_private.leave_game_guarded(input_game_id,input_player_id) $$;
revoke all on function public.leave_game_guarded(uuid,uuid) from public,anon;
grant execute on function public.leave_game_guarded(uuid,uuid) to authenticated;

-- Keep the private SECURITY DEFINER implementations unavailable through
-- PUBLIC, matching the explicit grants on their public invoker wrappers.
revoke all on function mainpot_private.finalize_settlement_guarded(uuid, text, uuid) from public, anon;
grant execute on function mainpot_private.finalize_settlement_guarded(uuid, text, uuid) to authenticated;
revoke all on function mainpot_private.save_discrepancy_allocation_guarded(uuid, jsonb) from public, anon;
grant execute on function mainpot_private.save_discrepancy_allocation_guarded(uuid, jsonb) to authenticated;
revoke all on function mainpot_private.leave_game_guarded(uuid, uuid) from public, anon;
grant execute on function mainpot_private.leave_game_guarded(uuid, uuid) to authenticated;

-- Financial activity is emitted only by guarded writers. The one remaining
-- client append is the host's non-financial return-to-create notice.
drop policy if exists "events append by matching actor or host" on public.game_events;
create policy "events append only host return notice" on public.game_events for insert to authenticated with check (
 event_type='host_returned_to_create' and amount is null and subject_player_id is null
 and exists (select 1 from public.players p where p.id=game_events.actor_player_id and p.game_id=game_events.game_id and p.user_id=auth.uid() and p.is_host)
);
