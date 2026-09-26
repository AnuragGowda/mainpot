import { execFileSync } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const container = "supabase_db_mainpot-e2e";
const database = `mainpot_restore_${randomUUID().replaceAll("-", "")}`;
const dumpPath = `/tmp/${database}.dump`;
const metadataPath = `${dumpPath}.metadata`;
const tableOfContentsPath = `${dumpPath}.list`;
const defaultsPath = `${dumpPath}.defaults.list`;
const sql = (query: string, db = "postgres") => execFileSync("docker", ["exec", container, "psql", "-X", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-Atc", query], { encoding: "utf8" }).trim();
const manifestQuery = `select jsonb_build_object(
  'games', (select md5(coalesce(string_agg(to_jsonb(g)::text, '' order by id), '')) from public.games g),
  'players', (select md5(coalesce(string_agg(to_jsonb(p)::text, '' order by id), '')) from public.players p),
  'buy_ins', (select md5(coalesce(string_agg(to_jsonb(b)::text, '' order by id), '')) from public.buy_ins b),
  'cash_outs', (select md5(coalesce(string_agg(to_jsonb(c)::text, '' order by id), '')) from public.cash_outs c),
  'game_events', (select md5(coalesce(string_agg(to_jsonb(e)::text, '' order by id), '')) from public.game_events e),
  'users', (select md5(coalesce(string_agg(to_jsonb(u)::text, '' order by id), '')) from auth.users u),
  'functions', (select md5(coalesce(string_agg(jsonb_build_object('name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',(select jsonb_agg(to_jsonb(a) order by a.grantee,a.grantor,a.privilege_type) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a))::text,'' order by p.oid::regprocedure::text),'')) from pg_proc p where p.prokind in ('f','p') and p.pronamespace in ('public'::regnamespace, 'mainpot_private'::regnamespace, 'auth'::regnamespace)),
  'policies', (select md5(coalesce(string_agg(to_jsonb(p)::text,'' order by schemaname,tablename,policyname),'')) from pg_policies p where schemaname in ('public','mainpot_private','auth')),
  'relations', (select md5(coalesce(string_agg(jsonb_build_object('name',n.nspname||'.'||c.relname,'owner',c.relowner,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',(select jsonb_agg(to_jsonb(a) order by a.grantee,a.grantor,a.privilege_type) from aclexplode(coalesce(c.relacl,case when c.relkind='S' then acldefault('s',c.relowner) else acldefault('r',c.relowner) end)) a))::text,'' order by n.nspname,c.relname),'')) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','mainpot_private','auth') and c.relkind in ('r','p','v','m','S')),
  'column_acls', (select md5(coalesce(string_agg(jsonb_build_object('name',n.nspname||'.'||c.relname||'.'||at.attname,'acl',(select jsonb_agg(to_jsonb(a) order by a.grantee,a.grantor,a.privilege_type) from aclexplode(at.attacl) a))::text,'' order by n.nspname,c.relname,at.attnum),'')) from pg_attribute at join pg_class c on c.oid=at.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','mainpot_private','auth') and at.attnum>0 and not at.attisdropped and at.attacl is not null),
  'default_acls', (select md5(coalesce(string_agg(jsonb_build_object('owner',d.defaclrole,'schema',coalesce(n.nspname,'*'),'kind',d.defaclobjtype,'acl',(select jsonb_agg(to_jsonb(a) order by a.grantee,a.grantor,a.privilege_type) from aclexplode(d.defaclacl) a))::text,'' order by d.defaclrole,coalesce(n.nspname,'*'),d.defaclobjtype),'')) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclnamespace=0 or n.nspname in ('public','mainpot_private','auth')),
  'schema_acls', (select md5(coalesce(string_agg(jsonb_build_object('name',n.nspname,'owner',n.nspowner,'acl',(select jsonb_agg(to_jsonb(a) order by a.grantee,a.grantor,a.privilege_type) from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a))::text,'' order by n.nspname),'')) from pg_namespace n where n.nspname in ('public','mainpot_private','auth'))
)::text`;
const status = JSON.parse(execFileSync("supabase", [...(process.env.SUPABASE_WORKDIR ? ["--workdir", process.env.SUPABASE_WORKDIR] : []), "status", "--output", "json"], { encoding: "utf8" }));
if (status.API_URL !== "http://127.0.0.1:55321") throw new Error("Recovery requires the disposable API.");
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const host = createClient(status.API_URL, status.PUBLISHABLE_KEY ?? status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let fixtureGame: string | undefined;
let fixtureUser: string | undefined;
let created = false;
try {
  // Only the disposable stack is eligible. No developer or production database.
  if (sql("select current_database()") !== "postgres") throw new Error("Unexpected local database.");
  const signedIn = await host.auth.signInAnonymously();
  if (signedIn.error || !signedIn.data.user) throw new Error("Could not create synthetic recovery identity.");
  fixtureUser = signedIn.data.user.id;
  const game = await host.rpc("create_game_guarded", { input_code: Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(30)]).join(""), input_game_name: "Isolated recovery fixture", input_host_name: "Recovery host", input_buy_in: 20, input_session_id: randomUUID() });
  if (game.error) throw game.error;
  fixtureGame = game.data[0].game_id;
  const phase = await host.from("games").update({ status: "settling" }).eq("id", fixtureGame);
  if (phase.error) throw phase.error;
  const cash = await host.rpc("save_cash_out", { input_game_id: fixtureGame, input_player_id: game.data[0].player_id, input_amount: 20, input_operation_key: randomUUID() });
  if (cash.error) throw cash.error;
  const rows = Number(sql("select count(*) from public.games"));
  if (rows < 1) throw new Error("Recovery must exercise a populated synthetic ledger.");
  const before = sql(manifestQuery);
  const backupStart = Date.now();
  execFileSync("docker", ["exec", container, "pg_dump", "-U", "postgres", "-d", "postgres", "-Fc", "-n", "public", "-n", "mainpot_private", "-n", "auth", "-f", dumpPath]);
  // A schema-filtered archive omits database-wide default ACL entries.
  // Save metadata separately and restore only defaults relevant to this scope.
  execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin", "-d", "postgres", "-Fc", "--schema-only", "-f", metadataPath]);
  const archiveList = (path: string) => execFileSync("docker", ["exec", container, "pg_restore", "--list", path], { encoding: "utf8" });
  const mainEntries = archiveList(dumpPath).split("\n");
  const publicSchemaEntry = /^\d+; \d+ \d+ SCHEMA - public /;
  if (mainEntries.filter(line => publicSchemaEntry.test(line)).length !== 1) throw new Error("Unexpected public-schema archive entry.");
  // Keep the target's initdb public-schema baseline (PUBLIC usage); the dump
  // intentionally records only differences from that baseline.
  execFileSync("docker", ["exec", "-i", container, "tee", tableOfContentsPath], { input: mainEntries.filter(line => !publicSchemaEntry.test(line)).join("\n"), stdio: ["pipe", "ignore", "pipe"] });
  const defaults = archiveList(metadataPath).split("\n").filter(line => /\bDEFAULT ACL (?:-|public|mainpot_private|auth) /.test(line));
  if (!defaults.length) throw new Error("Recovery archive omitted default privileges.");
  execFileSync("docker", ["exec", "-i", container, "tee", defaultsPath], { input: defaults.join("\n"), stdio: ["pipe", "ignore", "pipe"] });
  const recoveryStart = Date.now();
  sql(`create database ${database} template template0`);
  created = true;
  sql('create schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions;', database);
  execFileSync("docker", ["exec", container, "pg_restore", "-U", "supabase_admin", "-d", database, "--exit-on-error", "--use-list", tableOfContentsPath, dumpPath]);
  execFileSync("docker", ["exec", container, "pg_restore", "-U", "supabase_admin", "-d", database, "--exit-on-error", "--use-list", defaultsPath, metadataPath]);
  const restored = sql(manifestQuery, database);
  if (before !== restored) {
    const original = JSON.parse(before) as Record<string, string>;
    const recovered = JSON.parse(restored) as Record<string, string>;
    console.error("Recovery manifest differences:", Object.keys(original).filter(key => original[key] !== recovered[key]));
    const catalog = `select coalesce(jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'owner',p.proowner,'acl',p.proacl::text,'definition',md5(pg_get_functiondef(p.oid))) order by p.oid::regprocedure::text),'[]'::jsonb)::text from pg_proc p where p.prokind in ('f','p') and p.pronamespace in ('public'::regnamespace,'mainpot_private'::regnamespace,'auth'::regnamespace)`;
    const fromBackup = JSON.parse(sql(catalog)) as { name: string }[];
    const fromRestore = JSON.parse(sql(catalog, database)) as { name: string }[];
    const schemaCatalog = "select jsonb_agg(jsonb_build_object('name',nspname,'owner',nspowner,'acl',nspacl::text) order by nspname)::text from pg_namespace where nspname in ('public','mainpot_private','auth')";
    console.error("Schema catalog source:", sql(schemaCatalog));
    console.error("Schema catalog restored:", sql(schemaCatalog,database));
    console.error("Function catalog differences:", fromBackup.filter(row => JSON.stringify(row) !== JSON.stringify(fromRestore.find(target => target.name === row.name))).map(row => ({ source: row, restored: fromRestore.find(target => target.name === row.name) })));
    throw new Error("Restored ledger, auth, definitions or privileges differ from the backup.");
  }
  // Exercise the restored permissions and writer, rather than relying on
  // object counts alone. Roll back so the recovered manifest remains exact.
  sql(`begin;
    create function public.${database}_default() returns void language plpgsql security definer set search_path='' as $$ begin return; end $$;
    do $$ begin
      if has_function_privilege('anon','public.${database}_default()','execute') or has_function_privilege('authenticated','public.${database}_default()','execute') then
        raise exception 'Restored defaults expose a future privileged function';
      end if;
    end $$;
    set local role authenticated;
    select set_config('request.jwt.claims', '${JSON.stringify({ sub: fixtureUser, role: "authenticated" })}', true);
    do $$ begin
      if (select count(*) from public.games where id='${fixtureGame}'::uuid) <> 1 then
        raise exception 'Restored owner cannot read its game';
      end if;
      if (public.save_cash_out('${fixtureGame}'::uuid, '${game.data[0].player_id}'::uuid, 20, '${randomUUID()}'::uuid)).amount <> 20 then
        raise exception 'Restored guarded cash-out failed';
      end if;
    end $$;
    select set_config('request.jwt.claims', '${JSON.stringify({ sub: randomUUID(), role: "authenticated" })}', true);
    do $$ begin
      if exists(select 1 from public.games where id='${fixtureGame}'::uuid) then
        raise exception 'Restored RLS exposes the game to an unrelated identity';
      end if;
    end $$;
    rollback;`, database);
  if (sql(manifestQuery, database) !== before) throw new Error("Restored permission probe changed the recovered ledger.");
  if (sql(manifestQuery) !== before) throw new Error("The live synthetic source changed during the drill.");
  console.log(JSON.stringify({ status: "passed", scope: "Disposable Mainpot public/private/auth logical backup; shared local roles and owners, initdb public baseline, extensions preinstalled; cron schedules excluded", games: rows, backupMs: recoveryStart - backupStart, recoveryMs: Date.now() - recoveryStart, ledgerAndAuthHashesMatch: true, definitionsAndPrivilegesMatch: true, guardedRpcAndRlsPassed: true, sourceUnchanged: true, productionBackupRestore: false }));
} finally {
  const failures: unknown[] = [];
  const cleanupSteps = [
    async () => { if (created) sql(`drop database if exists ${database} with (force)`); },
    async () => { execFileSync("docker", ["exec", container, "rm", "-f", dumpPath, metadataPath, tableOfContentsPath, defaultsPath]); },
    async () => { if (fixtureGame) { const result = await admin.from("games").delete().eq("id", fixtureGame); if (result.error) throw result.error; } },
    async () => { if (fixtureUser) { const result = await admin.auth.admin.deleteUser(fixtureUser); if (result.error) throw result.error; } },
  ];
  for (const step of cleanupSteps) { try { await step(); } catch (error) { failures.push(error); } }
  if (failures.length) throw new AggregateError(failures, "Disposable recovery cleanup failed");
}
