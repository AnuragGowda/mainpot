-- Hosted Supabase projects can give anon/authenticated explicit EXECUTE grants
begin;

-- through default privileges. Revoking PUBLIC alone does not remove those.
-- Account-free Mainpot guests sign in anonymously and use the authenticated role.
-- PostgreSQL's global PUBLIC default cannot be undone by a schema-only revoke.
alter default privileges for role postgres
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

do $$
declare
  target record;
begin
  for target in
    select procedure.oid::regprocedure as signature,
           procedure.prorettype = 'pg_catalog.trigger'::regtype as is_trigger
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and (procedure.prosecdef or procedure.prorettype = 'pg_catalog.trigger'::regtype)
      and not exists (
        select 1 from pg_depend as dependency
        where dependency.classid = 'pg_proc'::regclass
          and dependency.objid = procedure.oid
          and dependency.refclassid = 'pg_extension'::regclass
          and dependency.deptype = 'e'
      )
  loop
    execute format('revoke execute on function %s from public, anon', target.signature);
    if target.is_trigger then
      execute format('revoke execute on function %s from authenticated', target.signature);
    end if;
  end loop;
end;
$$;

-- Maintenance is run by cron's database owner or the trusted service role,
-- never by a browser identity. This leaves all guarded user RPC grants intact.
revoke execute on function public.purge_expired_mainpot_data()
  from public, anon, authenticated;
grant execute on function public.purge_expired_mainpot_data() to service_role;
revoke execute on function public.purge_expired_product_ops_outbox()
  from public, anon, authenticated;
grant execute on function public.purge_expired_product_ops_outbox() to service_role;

commit;
