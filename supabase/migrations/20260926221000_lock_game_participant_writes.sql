-- Participation rows are derived from the finalized ledger by trusted database
-- code. Browser-owned writes let a participant forge net_result statistics.
-- Keep the established authenticated read policy unchanged.
drop policy if exists "game_participants insert own" on public.game_participants;
drop policy if exists "game_participants update own" on public.game_participants;
drop policy if exists "game_participants delete own" on public.game_participants;

-- The end-game trigger and anonymous-account-transfer function are owned,
-- SECURITY DEFINER database paths. service_role maintenance likewise retains
-- its role privileges, while Data API clients cannot mutate derived history.
revoke insert, update, delete on table public.game_participants from public, anon, authenticated;
