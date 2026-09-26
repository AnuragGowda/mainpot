-- Supabase hosted default privileges can explicitly grant anon execution.
-- Revoke that direct grant as well as PUBLIC on both inbox functions.
revoke all on function public.get_my_incoming_game_invites() from anon;
revoke all on function mainpot_private.get_my_incoming_game_invites() from anon;
notify pgrst, 'reload schema';
