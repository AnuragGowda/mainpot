-- Hosted projects may grant API roles function access through default
-- privileges. Revoking PUBLIC alone does not remove those explicit grants.
-- Guest sessions still use the authenticated role after anonymous sign-in.
revoke all on function public.create_game_guarded(text, text, text, numeric, text, boolean) from public, anon;
grant execute on function public.create_game_guarded(text, text, text, numeric, text, boolean) to authenticated;

revoke all on function public.add_host_player(uuid, text, numeric, uuid) from public, anon;
grant execute on function public.add_host_player(uuid, text, numeric, uuid) to authenticated;

revoke all on function public.create_buy_in_idempotent(uuid, uuid, numeric, text, uuid, uuid) from public, anon;
grant execute on function public.create_buy_in_idempotent(uuid, uuid, numeric, text, uuid, uuid) to authenticated;

-- This trigger runs through a permitted game update, never as a client RPC.
revoke all on function public.set_zero_cash_out_for_nonplaying_host() from public, anon, authenticated;
