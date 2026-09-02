-- Payment state is meaningful only after the host locks a stable settlement.
drop policy if exists "settlement payments created by parties or host" on public.settlement_payments;
create policy "settlement payments created by parties or host"
on public.settlement_payments
for insert
to authenticated
with check (
  public.game_has_status(game_id, 'ended')
  and (
    public.owns_player(from_player_id)
    or public.owns_player(to_player_id)
    or public.is_game_host(game_id)
  )
);

drop policy if exists "settlement payments updated by parties or host" on public.settlement_payments;
create policy "settlement payments updated by parties or host"
on public.settlement_payments
for update
to authenticated
using (
  public.game_has_status(game_id, 'ended')
  and (
    public.owns_player(from_player_id)
    or public.owns_player(to_player_id)
    or public.is_game_host(game_id)
  )
)
with check (
  public.game_has_status(game_id, 'ended')
  and (
    public.owns_player(from_player_id)
    or public.owns_player(to_player_id)
    or public.is_game_host(game_id)
  )
);
