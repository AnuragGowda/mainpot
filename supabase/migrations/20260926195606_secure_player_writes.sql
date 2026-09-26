-- Player creation is a ledger operation. Only the guarded SECURITY DEFINER
-- RPCs may create seats; PostgREST inserts could otherwise skip capacity,
-- active-game, and host-role checks.
revoke insert on table public.players from public, anon, authenticated;

-- Deleting a seat cascades its buy-ins and cash-outs. A participant therefore
-- cannot delete their own financial history. The active host may still remove
-- a non-host seat through the existing host control; service-role maintenance
-- retains its separate database role privileges.
drop policy if exists "players self or host delete" on public.players;
create policy "players host deletes non-host seats" on public.players
  for delete to authenticated
  using (
    public.game_has_status(game_id, 'active')
    and public.is_game_host(game_id)
    and is_host = false
  );
