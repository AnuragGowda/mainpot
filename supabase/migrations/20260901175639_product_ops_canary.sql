-- A server-only probe table lets health checks exercise database and Realtime
-- without creating or changing a customer game.
create table public.product_ops_canary (
  probe_id uuid primary key,
  created_at timestamptz not null default now()
);

alter table public.product_ops_canary enable row level security;
revoke all on table public.product_ops_canary from anon, authenticated, service_role;
grant select, insert, delete on table public.product_ops_canary to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'product_ops_canary'
  ) then
    alter publication supabase_realtime add table public.product_ops_canary;
  end if;
end;
$$;
