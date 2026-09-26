-- Subscription entitlements are assigned by trusted server operations, never
-- by a browser profile edit or delete-and-recreate. RLS continues to restrict
-- all permitted profile edits to the authenticated user's own row.
revoke insert, update on table public.profiles from public, anon, authenticated;
revoke insert (plan, supporter_until), update (plan, supporter_until)
  on table public.profiles from public, anon, authenticated;
grant insert (id, username, display_name, avatar_url, venmo_handle, zelle_handle, bio)
  on table public.profiles to authenticated;
grant update (username, display_name, avatar_url, venmo_handle, zelle_handle, bio, updated_at)
  on table public.profiles to authenticated;
