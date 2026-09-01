-- Retain pseudonymous Product Ops events for 90 days. This index keeps the
-- scheduled hosted-Supabase cleanup bounded to the expiry predicate.
create index if not exists product_ops_outbox_received_at_idx
  on public.product_ops_outbox (received_at);

create or replace function public.purge_expired_product_ops_outbox()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.product_ops_outbox
  where received_at < now() - interval '90 days';
$$;

revoke all on function public.purge_expired_product_ops_outbox()
  from public, anon, authenticated, service_role;

-- pg_cron is available on hosted Supabase and has already been enabled by the
-- public-beta migration. Keep this idempotent for existing installations.
create extension if not exists pg_cron;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'purge-expired-product-ops-outbox';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'purge-expired-product-ops-outbox',
    '41 3 * * *',
    'select public.purge_expired_product_ops_outbox()'
  );
end;
$$;
