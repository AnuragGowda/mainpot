import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseCommand = process.platform === "win32" ? "supabase.cmd" : "supabase";
const supabaseWorkdir = process.env.SUPABASE_WORKDIR;
const expectedApiUrl = process.env.SUPABASE_EXPECTED_API_URL;

function localStatus() {
  const args = [
    ...(supabaseWorkdir ? ["--workdir", supabaseWorkdir] : []),
    "status",
    "--output",
    "json",
  ];
  const status = JSON.parse(execFileSync(supabaseCommand, args, { encoding: "utf8" }));
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(status.API_URL ?? "")) {
    throw new Error(`Refusing to run against non-local Supabase URL: ${status.API_URL}`);
  }
  if (expectedApiUrl && status.API_URL !== expectedApiUrl) {
    throw new Error(`Supabase API URL did not match the disposable test stack: ${status.API_URL}`);
  }
  return status;
}

const status = localStatus();
const url = status.API_URL;
const anonKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase credentials are incomplete.");

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const games: string[] = [];
const users: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function expectDenied(
  operation: () => PromiseLike<{ data: unknown; error: unknown }>,
  label: string,
) {
  const result = await operation();
  assert(result.error || (Array.isArray(result.data) && result.data.length === 0), `${label} is denied`);
  return result;
}

async function permanent(label: string): Promise<{ id: string; client: SupabaseClient }> {
  const email = `audit-${label}-${randomUUID()}@example.test`;
  const password = `Audit-${randomUUID()}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: label },
  });
  if (createError || !created.user) throw createError ?? new Error("Could not create test user");
  users.push(created.user.id);

  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: created.user.id, client };
}

async function createGame(client: SupabaseClient, label: string) {
  const code = Array.from(
    { length: 6 },
    () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 30)],
  ).join("");
  const { data, error } = await client.rpc("create_game_guarded", {
    input_code: code,
    input_game_name: label,
    input_host_name: label,
    input_buy_in: 20,
    input_session_id: randomUUID(),
    input_host_is_playing: true,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as {
    game_id: string;
    player_id: string;
    code: string;
  } | null;
  assert(row?.game_id && row.player_id && row.code, "guarded game creation returns identifiers");
  games.push(row.game_id);
  return row;
}

async function joinGame(client: SupabaseClient, code: string, name: string) {
  const { data, error } = await client.rpc("join_game_guarded", {
    input_code: code,
    input_player_name: name,
    input_session_id: randomUUID(),
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { player_id: string } | null;
  assert(row?.player_id, "guarded join returns a player identifier");
  return row;
}

if (url !== "http://127.0.0.1:55321" || expectedApiUrl !== url) {
  throw new Error("Fault injection requires the disposable mainpot-e2e stack.");
}
function sql(command: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_mainpot-e2e", "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", command], { encoding: "utf8" });
}
async function run() {
  const host = await permanent("atomic-host");
  const player = await permanent("atomic-player");
  const game = await createGame(host.client, "Atomic ledger activity");
  const seat = await joinGame(player.client, game.code, "Jordan");
  const operation = randomUUID();
  const args = { input_game_id: game.game_id, input_player_id: seat.player_id,
    input_amount: 7, input_type: "rebuy", input_fronted_by_player_id: null,
    input_operation_key: operation };
  const countEvents = async (type: string) => {
    const result = await admin.from("game_events").select("id").eq("game_id", game.game_id).eq("event_type", type).eq("amount", 7);
    if (result.error) throw result.error;
    return result.data.length;
  };
  sql(`create function public.test_reject_activity() returns trigger language plpgsql as $$ begin if new.game_id = '${game.game_id}'::uuid then raise exception 'Injected audit write failure'; end if; return new; end $$;
    create trigger test_reject_activity before insert on public.game_events for each row execute function public.test_reject_activity();`);
  try {
    const failed = await player.client.rpc("create_buy_in_idempotent", args);
    assert(failed.error, "audit failure rejects buy-in RPC");
    const ledger = await admin.from("buy_ins").select("id").eq("operation_key", operation);
    assert(!ledger.error && ledger.data.length === 0, "failed activity rolls back buy-in");
  } finally { sql("drop trigger if exists test_reject_activity on public.game_events; drop function if exists public.test_reject_activity();"); }
  const inserted = await player.client.rpc("create_buy_in_idempotent", args);
  if (inserted.error) throw inserted.error;
  const buyInId = inserted.data[0].id;
  assert(inserted.data[0].created, "successful retry creates the entry");
  const replay = await player.client.rpc("create_buy_in_idempotent", args);
  assert(!replay.error && !replay.data[0].created && replay.data[0].id === buyInId, "lost-response retry reuses entry");
  assert(await countEvents("buy_in_added") === 1, "retry appends exactly one activity");
  const canonical = await admin.from("game_events").select("actor_player_id,subject_player_id,amount,metadata")
    .eq("game_id", game.game_id).eq("event_type", "buy_in_added").eq("amount", 7).single();
  if (canonical.error) throw canonical.error;
  const legacyEvent = { ...canonical.data, game_id: game.game_id, event_type: "buy_in_added" };
  const legacyAppends = await Promise.all([player.client.from("game_events").insert(legacyEvent), player.client.from("game_events").insert(legacyEvent)]);
  assert(legacyAppends.every(result => !result.error), "cached clients can append the same committed event without false failure");
  assert(await countEvents("buy_in_added") === 1, "legacy appends do not duplicate the canonical activity");
  const outsider = await permanent("atomic-outsider");
  assert((await outsider.client.from("game_events").insert(legacyEvent)).error, "duplicate suppression does not bypass event authorization");
  const action = (client: SupabaseClient, value: string) => client.rpc("apply_host_buy_in_action", { input_buy_in_id: buyInId, input_action: value });
  assert((await action(player.client, "verify")).error, "participant cannot approve an entry");
  sql(`create function public.test_reject_activity() returns trigger language plpgsql as $$ begin if new.game_id = '${game.game_id}'::uuid then raise exception 'Injected audit write failure'; end if; return new; end $$;
    create trigger test_reject_activity before insert on public.game_events for each row execute function public.test_reject_activity();`);
  try {
    assert((await action(host.client, "verify")).error, "audit failure rejects verification");
    const pending = await admin.from("buy_ins").select("verified").eq("id", buyInId).single();
    assert(!pending.error && !pending.data.verified, "failed verification remains pending");
    assert((await action(host.client, "remove")).error, "audit failure rejects removal");
    const retained = await admin.from("buy_ins").select("id").eq("id", buyInId).single();
    assert(!retained.error && retained.data, "failed removal retains financial record");
  } finally { sql("drop trigger if exists test_reject_activity on public.game_events; drop function if exists public.test_reject_activity();"); }
  assert(!(await action(host.client, "verify")).error, "host verifies");
  assert(!(await action(host.client, "verify")).error, "verification replay succeeds");
  assert(await countEvents("buy_in_verified") === 1, "verification activity is once only");
  const advanceArgs = { ...args, input_operation_key: randomUUID(), input_fronted_by_player_id: game.player_id };
  const advance = await host.client.rpc("create_buy_in_idempotent", advanceArgs);
  if (advance.error) throw advance.error;
  const repayArgs = { input_buy_in_id: advance.data[0].id, input_action: "repay_advance" };
  assert(!(await host.client.rpc("apply_host_buy_in_action", repayArgs)).error, "host marks advance repaid");
  assert(!(await host.client.rpc("apply_host_buy_in_action", repayArgs)).error, "repayment replay succeeds");
  assert(await countEvents("buy_in_advance_repaid") === 1, "repayment activity is once only");
  assert(!(await action(host.client, "remove")).error, "host removes");
  assert(!(await action(host.client, "remove")).error, "removal replay succeeds");
  assert(await countEvents("buy_in_removed") === 1, "removal activity is once only");
  console.log("✓ financial writes roll back on activity failure and retries append activity once");
}
try { await run(); } finally {
  sql("drop trigger if exists test_reject_activity on public.game_events; drop function if exists public.test_reject_activity();");
  for (const gameId of games) await admin.from("games").delete().eq("id", gameId);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}
