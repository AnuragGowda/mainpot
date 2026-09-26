import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const container = "supabase_db_mainpot-e2e";
const database = `mainpot_restore_${randomUUID().replaceAll("-", "")}`;
const dumpPath = `/tmp/${database}.dump`;
const sql = (query: string, db = "postgres") => execFileSync("docker", ["exec", container, "psql", "-X", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-Atc", query], { encoding: "utf8" }).trim();
const manifestQuery = `select jsonb_build_object(
  'games', (select md5(coalesce(string_agg(to_jsonb(g)::text, '' order by id), '')) from public.games g),
  'players', (select md5(coalesce(string_agg(to_jsonb(p)::text, '' order by id), '')) from public.players p),
  'buy_ins', (select md5(coalesce(string_agg(to_jsonb(b)::text, '' order by id), '')) from public.buy_ins b),
  'cash_outs', (select md5(coalesce(string_agg(to_jsonb(c)::text, '' order by id), '')) from public.cash_outs c),
  'game_events', (select md5(coalesce(string_agg(to_jsonb(e)::text, '' order by id), '')) from public.game_events e),
  'users', (select md5(coalesce(string_agg(to_jsonb(u)::text, '' order by id), '')) from auth.users u),
  'functions', (select count(*) from pg_proc where pronamespace in ('public'::regnamespace, 'mainpot_private'::regnamespace)),
  'policies', (select count(*) from pg_policies where schemaname in ('public', 'mainpot_private'))
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
  const game = await host.rpc("create_game_guarded", { input_code: "RC" + randomUUID().replaceAll("-", "").slice(0, 4).toUpperCase(), input_game_name: "Isolated recovery fixture", input_host_name: "Recovery host", input_buy_in: 20, input_session_id: randomUUID() });
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
  const recoveryStart = Date.now();
  sql(`create database ${database} template template0`);
  created = true;
  sql('create schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions;', database);
  execFileSync("docker", ["exec", container, "pg_restore", "-U", "postgres", "-d", database, "--no-owner", "--exit-on-error", dumpPath]);
  const restored = sql(manifestQuery, database);
  if (before !== restored) throw new Error("Restored ledger, auth, functions or policies differ from the backup.");
  // Exercise the restored permissions and writer, rather than relying on
  // object counts alone. Roll back so the recovered manifest remains exact.
  sql(`begin;
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
  console.log(JSON.stringify({ status: "passed", scope: "Disposable Mainpot public/private/auth logical backup; shared local roles, extensions preinstalled", games: rows, backupMs: recoveryStart - backupStart, recoveryMs: Date.now() - recoveryStart, ledgerAndAuthHashesMatch: true, guardedRpcAndRlsPassed: true, sourceUnchanged: true, productionBackupRestore: false }));
} finally {
  if (created) sql(`drop database if exists ${database} with (force)`);
  execFileSync("docker", ["exec", container, "rm", "-f", dumpPath]);
  if (fixtureGame) { const result = await admin.from("games").delete().eq("id", fixtureGame); if (result.error) throw result.error; }
  if (fixtureUser) { const result = await admin.auth.admin.deleteUser(fixtureUser); if (result.error) throw result.error; }
}
