-- Some Supabase projects define default execute grants for API roles. Remove
-- both those named grants and the PostgreSQL PUBLIC default on this definer
-- function; pg_cron runs it as the owning database role.
revoke all on function public.purge_expired_product_ops_outbox()
  from public, anon, authenticated, service_role;
