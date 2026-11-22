import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const command = process.platform === "win32" ? "supabase.cmd" : "supabase";
const workdir = process.env.SUPABASE_WORKDIR;
const status = JSON.parse(execFileSync(command, [
  ...(workdir ? ["--workdir", workdir] : []), "status", "--output", "json",
], { encoding: "utf8" }));
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(status.API_URL ?? "")
  || (process.env.SUPABASE_EXPECTED_API_URL && status.API_URL !== process.env.SUPABASE_EXPECTED_API_URL)) {
  throw new Error("Maintenance permission tests require the expected disposable local database.");
}
const projectId = JSON.parse(execFileSync("docker", ["inspect", "supabase_db_mainpot-e2e", "--format", "{{json .Name}}"], { encoding: "utf8" }));
if (projectId !== "/supabase_db_mainpot-e2e") throw new Error("Disposable database container not found.");

function sql(query: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_mainpot-e2e", "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], {
    input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const assertions = `
do $verify$
begin
  if has_function_privilege('anon', 'public.purge_expired_mainpot_data()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.purge_expired_mainpot_data()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.purge_expired_product_ops_outbox()', 'EXECUTE') then
    raise exception 'Browser identities can execute maintenance';
  end if;
  if not has_function_privilege('service_role', 'public.purge_expired_mainpot_data()', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.purge_expired_product_ops_outbox()', 'EXECUTE') then
    raise exception 'Trusted maintenance role lost access';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and p.prokind='f'
    and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass
      and d.objid=p.oid and d.refclassid='pg_extension'::regclass and d.deptype='e')
    and has_function_privilege('anon',p.oid,'EXECUTE')) then
    raise exception 'Unauthenticated definer grant remains';
  end if;
  if not has_function_privilege('authenticated',
    'public.create_game_idempotent(text,text,text,numeric,text,boolean,uuid)', 'EXECUTE') then
    raise exception 'Guarded user creation lost access';
  end if;
end;
$verify$;
`;
sql(assertions);
sql(`begin;
do $retention$
declare
  expired_game uuid := gen_random_uuid();
  current_game uuid := gen_random_uuid();
  saved_game uuid := gen_random_uuid();
  room_id uuid;
  host_id uuid;
  player_id uuid;
begin
  insert into public.games (
    id, code, name, host_session_id, host_name, buy_in_amount, host_is_anonymous, expires_at
  ) values
    (expired_game, 'PURGEX', 'Expired guest room', 'cleanup-host', 'Host', 20, true, now() - interval '1 day'),
    (current_game, 'PURGEC', 'Current guest room', 'cleanup-host', 'Host', 20, true, now() + interval '1 day'),
    (saved_game, 'PURGES', 'Saved account room', 'cleanup-host', 'Host', 20, false, null);

  foreach room_id in array array[expired_game, current_game, saved_game] loop
    insert into public.players (game_id, session_id, name, is_host)
      values (room_id, 'cleanup-host', 'Host', true) returning id into host_id;
    insert into public.players (game_id, session_id, name)
      values (room_id, 'cleanup-player', 'Player') returning id into player_id;
    insert into public.buy_ins (game_id, player_id, amount, verified)
      values (room_id, player_id, 20, true);
    insert into public.cash_outs (game_id, player_id, amount)
      values (room_id, player_id, 15);
    insert into public.early_cash_outs (
      game_id, player_id, bank_player_id, cash_out_amount, verified_buy_in_amount,
      funding_adjustment, net_amount, status, locked_at
    ) values (room_id, player_id, host_id, 15, 20, 0, -5, 'locked', now());
    insert into public.settlement_payments (game_id, from_player_id, to_player_id, amount, mode)
      values (room_id, player_id, host_id, 5, 'early_exit');
  end loop;

  begin
    delete from public.buy_ins where game_id = expired_game;
    raise exception 'The expired room still requires whole-game cleanup';
  exception when raise_exception then
    if sqlerrm <> 'Buy-ins involving a locked early cash-out cannot be changed' then raise; end if;
  end;
  begin
    delete from public.cash_outs where game_id = expired_game;
    raise exception 'A locked cash-out should reject a direct delete';
  exception when raise_exception then
    if sqlerrm <> 'A locked early cash-out cannot be changed' then raise; end if;
  end;

  perform public.purge_expired_mainpot_data();
  perform public.purge_expired_mainpot_data();
  if exists (select 1 from public.games where id = expired_game)
    or exists (select 1 from public.players where game_id = expired_game)
    or exists (select 1 from public.buy_ins where game_id = expired_game)
    or exists (select 1 from public.cash_outs where game_id = expired_game)
    or exists (select 1 from public.early_cash_outs where game_id = expired_game)
    or exists (select 1 from public.settlement_payments where game_id = expired_game) then
    raise exception 'Expired guest room and ledger should be removed';
  end if;
  if (select count(*) from public.games where id in (current_game, saved_game)) <> 2
    or (select count(*) from public.early_cash_outs where game_id in (current_game, saved_game) and status = 'locked') <> 2
    or (select count(*) from public.buy_ins where game_id in (current_game, saved_game)) <> 2
    or (select count(*) from public.cash_outs where game_id in (current_game, saved_game)) <> 2
    or (select count(*) from public.settlement_payments where game_id in (current_game, saved_game)) <> 2 then
    raise exception 'Cleanup changed an unexpired guest room or a saved account room';
  end if;
end;
$retention$;
rollback;`);
console.log("✓ expired guest rooms with locked cash-outs are purged, and current and saved ledgers are preserved");

const migration = readFileSync(new URL("../supabase/migrations/20260926203813_restrict_hosted_function_defaults.sql", import.meta.url), "utf8")
  .replace(/^begin;\s*$/gm, "").replace(/^commit;\s*$/gm, "");
// Simulate hosted explicit grants, repair them, and prove future defaults in one
// rolled-back transaction. The production cleanup function is never invoked.
sql(`begin;
grant execute on function public.purge_expired_mainpot_data() to anon, authenticated;
${migration}
${assertions}
create function public.mainpot_default_permission_probe() returns boolean language sql security definer as 'select true';
do $probe$ begin
  if has_function_privilege('anon','public.mainpot_default_permission_probe()','EXECUTE')
    or has_function_privilege('authenticated','public.mainpot_default_permission_probe()','EXECUTE') then
    raise exception 'New functions inherit unintended browser grants';
  end if;
end $probe$;
rollback;`);

const key = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const client = createClient(status.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let userId: string | undefined;
try {
  const unauthenticated = await client.rpc("purge_expired_mainpot_data");
  assert(unauthenticated.error, "Unauthenticated cleanup must be denied at the API");
  const signedIn = await client.auth.signInAnonymously();
  assert(!signedIn.error && signedIn.data.user, "Disposable guest sign-in must work");
  userId = signedIn.data.user.id;
  const authenticated = await client.rpc("purge_expired_mainpot_data");
  assert(authenticated.error, "Signed-in guest cleanup must be denied at the API");
  console.log("✓ hosted default and explicit grants cannot expose maintenance; guarded user RPCs and the service role retain access");
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId);
}
