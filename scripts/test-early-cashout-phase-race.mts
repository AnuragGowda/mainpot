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

async function waitForBlockedRequest() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const blocked = runPsql("select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%request_early_cash_out%'");
    if (Number(blocked) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Early-cash-out RPC did not block on the held game row lock");
}

async function run() {
  const host = await guest("Phase-race host");
  const player = await guest("Phase-race player");
  const code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 30)]).join("");
  const created = await host.client.rpc("create_game_guarded", {
    input_code: code,
    input_game_name: "Early cash-out phase race",
    input_host_name: "Phase-race host",
    input_buy_in: 20,
    input_session_id: randomUUID(),
  });
  if (created.error) throw created.error;
  const game = (Array.isArray(created.data) ? created.data[0] : created.data) as { game_id: string; player_id: string };
  gameId = game.game_id;
  const joined = await player.client.rpc("join_game_guarded", {
    input_code: code,
    input_player_name: "Phase-race player",
    input_session_id: randomUUID(),
  });
  if (joined.error) throw joined.error;
  const joinedPlayer = (Array.isArray(joined.data) ? joined.data[0] : joined.data) as { player_id: string };
  const approval = await host.client.from("buy_ins").update({ verified: true }).eq("player_id", joinedPlayer.player_id);
  if (approval.error) throw approval.error;

  const locker = spawn("docker", psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
  try {
    const ready = waitForLine(locker, "__GAME_LOCKED__");
    locker.stdin!.write(`begin; select id from public.games where id = '${game.game_id}' for update; \\echo __GAME_LOCKED__\n`);
    await ready;

    const request = player.client.rpc("request_early_cash_out", {
      input_game_id: game.game_id,
      input_player_id: joinedPlayer.player_id,
      input_cash_out_amount: 20,
      input_session_id: randomUUID(),
    }).then((response) => response);
    await waitForBlockedRequest();

    locker.stdin!.write(`update public.games set status = 'settling' where id = '${game.game_id}'; commit;\n`);
    const response = await request;
    assert(response.error, "a request queued behind the phase transition cannot commit after settlement starts");
    const pending = await admin.from("early_cash_outs").select("id").eq("game_id", game.game_id).eq("status", "requested");
    assert(!pending.error && pending.data?.length === 0, "the phase transition leaves no stuck pending early cash-out");
  } finally {
    locker.stdin?.end();
    if (locker.exitCode === null) locker.kill();
  }
  console.log("Early cash-out phase race passed.");
}

try {
  await run();
} finally {
  if (gameId) await admin.from("games").delete().eq("id", gameId);
  await Promise.all(clients.map((client) => client.auth.signOut()));
  await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
}
