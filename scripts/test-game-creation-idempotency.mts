import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseCommand = process.platform === "win32" ? "supabase.cmd" : "supabase";
const workdir = process.env.SUPABASE_WORKDIR;
const expectedApiUrl = process.env.SUPABASE_EXPECTED_API_URL;

function localStatus() {
  const args = [...(workdir ? ["--workdir", workdir] : []), "status", "--output", "json"];
  const current = JSON.parse(execFileSync(supabaseCommand, args, { encoding: "utf8" }));
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(current.API_URL ?? "")) {
    throw new Error(`Refusing non-local Supabase URL: ${current.API_URL}`);
  }
  if (expectedApiUrl && current.API_URL !== expectedApiUrl) {
    throw new Error("Supabase API URL did not match the disposable test stack.");
  }
  return current;
}

const current = localStatus();
const url = current.API_URL;
const anonKey = current.PUBLISHABLE_KEY ?? current.ANON_KEY;
const serviceKey = current.SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase credentials are incomplete.");

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const users: string[] = [];
const games: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function guest(label: string): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInAnonymously({ options: { data: { display_name: label } } });
  if (error || !data.user) throw error ?? new Error("Anonymous sign-in failed");
  users.push(data.user.id);
  return { client, userId: data.user.id };
}

async function run() {
  const owner = await guest("creation owner");
  const other = await guest("creation attacker");
  const input = {
    input_code: "CREA42",
    input_game_name: "Idempotent creation",
    input_host_name: "Casey",
    input_buy_in: 20,
    input_session_id: randomUUID(),
    input_host_is_playing: true,
    input_operation_key: randomUUID(),
  };
  const [first, replay] = await Promise.all([
    owner.client.rpc("create_game_idempotent", input),
    owner.client.rpc("create_game_idempotent", input),
  ]);
  const firstRow = (Array.isArray(first.data) ? first.data[0] : first.data) as { game_id?: string; player_id?: string } | null;
  const replayRow = (Array.isArray(replay.data) ? replay.data[0] : replay.data) as { game_id?: string; player_id?: string } | null;
  assert(!first.error && !replay.error && firstRow?.game_id && firstRow.player_id, "same create operation succeeds");
  assert(firstRow.game_id === replayRow?.game_id && firstRow.player_id === replayRow.player_id, "replay returns the original table and host seat");
  games.push(firstRow.game_id);

  const [createdGames, seats, openingBuyIns] = await Promise.all([
    admin.from("games").select("id").eq("id", firstRow.game_id),
    admin.from("players").select("id").eq("game_id", firstRow.game_id),
    admin.from("buy_ins").select("id, verified, amount").eq("game_id", firstRow.game_id),
  ]);
  assert(createdGames.data?.length === 1 && seats.data?.length === 1, "replay creates exactly one game and one host seat");
  assert(openingBuyIns.data?.length === 1 && openingBuyIns.data[0].verified && Number(openingBuyIns.data[0].amount) === 20, "replay creates exactly one verified opening buy-in");

  const stolen = await other.client.rpc("create_game_idempotent", input);
  assert(stolen.error, "another account cannot replay the owner operation key");
  const changed = await owner.client.rpc("create_game_idempotent", { ...input, input_game_name: "Changed details" });
  assert(changed.error, "the same operation key rejects changed game details");
  console.log("✓ idempotent game creation replays one table/seat/buy-in and rejects cross-account or changed payloads");
}

try {
  await run();
} finally {
  for (const gameId of games) await admin.from("games").delete().eq("id", gameId);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}
