import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseCommand = process.platform === "win32" ? "supabase.cmd" : "supabase";
const workdir = process.env.SUPABASE_WORKDIR;
const status = JSON.parse(spawnSync(supabaseCommand, [
  ...(workdir ? ["--workdir", workdir] : []), "status", "--output", "json",
], { encoding: "utf8" }).stdout);
const url = status.API_URL as string | undefined;
const databaseContainer = "supabase_db_mainpot-e2e";
const psqlArgs = ["exec", "-i", databaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-At"];
const anonKey = (status.PUBLISHABLE_KEY ?? status.ANON_KEY) as string | undefined;
const serviceKey = status.SERVICE_ROLE_KEY as string | undefined;
if (url !== "http://127.0.0.1:55321" || process.env.SUPABASE_EXPECTED_API_URL !== url) {
  throw new Error("The race regression requires the disposable mainpot-e2e stack.");
}
if (!anonKey || !serviceKey) throw new Error("Local Supabase credentials are incomplete.");

const admin = createClient(url!, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const clients: SupabaseClient[] = [];
const userIds: string[] = [];
let gameId: string | undefined;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function guest(label: string) {
  const client = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInAnonymously({ options: { data: { display_name: label } } });
  if (error || !data.user) throw error ?? new Error(`Could not create ${label}`);
  clients.push(client);
  userIds.push(data.user.id);
  return { client, id: data.user.id };
}

function runPsql(sql: string) {
  const result = spawnSync("docker", [...psqlArgs, "-c", sql], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "psql failed");
  return result.stdout.trim();
}

function waitForLine(child: ReturnType<typeof spawn>, marker: string) {
  return new Promise<void>((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${marker}`)), 5_000);
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(marker)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("exit", (code) => {
      if (!output.includes(marker)) {
        clearTimeout(timeout);
        reject(new Error(`psql exited before ${marker} (code ${code}): ${output}`));
      }
    });
  });
}

async function waitForBlockedCorrection() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const blocked = runPsql("select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%correct_buy_in_as_host%'");
    if (Number(blocked) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Correction RPC did not block on the held game row lock");
}

async function run() {
  const host = await guest("Correction-lock host");
  const code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 30)]).join("");
  const created = await host.client.rpc("create_game_guarded", {
    input_code: code, input_game_name: "Correction lock order",
    input_host_name: "Correction-lock host", input_buy_in: 20, input_session_id: randomUUID(),
  });
  if (created.error) throw created.error;
  const game = (Array.isArray(created.data) ? created.data[0] : created.data) as { game_id: string; player_id: string };
  gameId = game.game_id;
  const opening = await admin.from("buy_ins").select("id").eq("player_id", game.player_id).single();
  if (opening.error) throw opening.error;
  const correctionKey = randomUUID();
  const correctionInput = { input_buy_in_id: opening.data.id, input_amount: 25, input_operation_key: correctionKey };
  const locker = spawn("docker", psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
  try {
    const ready = waitForLine(locker, "__GAME_LOCKED__");
    locker.stdin!.write(`begin; select id from public.games where id = '${game.game_id}' for update; \\echo __GAME_LOCKED__\n`);
    await ready;
    const correction = host.client.rpc("correct_buy_in_as_host", correctionInput).then((response) => response);
    await waitForBlockedCorrection();

    // The correction must be waiting on the game without owning the entry.
    // Run the actual competing host action in the transaction holding that
    // game. With the old entry-first correction this forms a deadlock cycle.
    const applied = waitForLine(locker, "__ACTION_APPLIED__");
    locker.stdin!.write(`set local statement_timeout = '3s'; set local role authenticated; set local request.jwt.claims = '{"sub":"${host.id}","role":"authenticated","is_anonymous":true}'; select public.apply_host_buy_in_action('${opening.data.id}', 'verify'); \\echo __ACTION_APPLIED__\n`);
    await applied;
    locker.stdin!.write("commit;\n");
    const response = await correction;
    assert(!response.error && Number(response.data?.amount) === 25, "both competing host actions finish without deadlock");
    const ledger = await admin.from("buy_ins").select("amount,verified").eq("id", opening.data.id).single();
    assert(!ledger.error && Number(ledger.data?.amount) === 25 && ledger.data?.verified, "correction is fully committed and verified");
  } finally {
    locker.stdin?.end();
    if (locker.exitCode === null) locker.kill();
  }

  const settling = await host.client.from("games").update({ status: "settling" }).eq("id", game.game_id);
  if (settling.error) throw settling.error;
  const cashOut = await admin.from("cash_outs").insert({ game_id: game.game_id, player_id: game.player_id, amount: 25 });
  if (cashOut.error) throw cashOut.error;
  const ended = await host.client.from("games").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", game.game_id);
  if (ended.error) throw ended.error;
  const replay = await host.client.rpc("correct_buy_in_as_host", correctionInput);
  assert(!replay.error && Number(replay.data?.amount) === 25, "successful correction remains replayable after finalization");
  const freshCorrection = await host.client.rpc("correct_buy_in_as_host", { ...correctionInput, input_amount: 26, input_operation_key: randomUUID() });
  assert(freshCorrection.error, "a new correction cannot change the finalized ledger");
  console.log("Correction lock order and finalized retry passed.");
}

try {
  await run();
} finally {
  if (gameId) await admin.from("games").delete().eq("id", gameId);
  await Promise.all(clients.map((client) => client.auth.signOut()));
  await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
}
