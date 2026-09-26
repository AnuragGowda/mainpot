import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseCommand = process.platform === "win32" ? "supabase.cmd" : "supabase";
const workdir = process.env.SUPABASE_WORKDIR;
const expectedApiUrl = process.env.SUPABASE_EXPECTED_API_URL;

function status() {
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

const current = status();
const url = current.API_URL;
const anonKey = current.PUBLISHABLE_KEY ?? current.ANON_KEY;
const serviceKey = current.SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase credentials are incomplete.");

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const clients: SupabaseClient[] = [];
const users: string[] = [];
const games: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function guest(label: string) {
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInAnonymously({ options: { data: { display_name: label } } });
  if (error || !data.user) throw error ?? new Error("Anonymous sign-in failed");
  clients.push(client);
  users.push(data.user.id);
  return client;
}

async function expectRejected(operation: () => PromiseLike<{ data: unknown; error: unknown }>, label: string) {
  const result = await operation();
  assert(Boolean(result.error), label);
}

async function run() {
  const host = await guest("allocation host");
  const guestA = await guest("allocation guest A");
  const guestB = await guest("allocation guest B");
  const code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 30)]).join("");
  const created = await host.rpc("create_game_guarded", {
    input_code: code,
    input_game_name: "Allocation guard",
    input_host_name: "Host",
    input_buy_in: 20,
    input_session_id: randomUUID(),
  });
  const game = (Array.isArray(created.data) ? created.data[0] : created.data) as { game_id: string; player_id: string } | null;
  if (created.error || !game?.game_id || !game.player_id) {
    throw created.error ?? new Error("Guarded game creation did not return identifiers");
  }
  const gameId = game.game_id;
  const hostPlayerId = game.player_id;
  games.push(gameId);

  async function join(client: SupabaseClient, name: string) {
    const joined = await client.rpc("join_game_guarded", {
      input_code: code,
      input_player_name: name,
      input_session_id: randomUUID(),
    });
    const row = (Array.isArray(joined.data) ? joined.data[0] : joined.data) as { player_id: string } | null;
    assert(!joined.error && row?.player_id, `${name} joins`);
    return row.player_id;
  }

  const playerA = await join(guestA, "A");
  const playerB = await join(guestB, "B");
  const approval = await host.from("buy_ins").update({ verified: true }).eq("game_id", gameId).eq("verified", false).select("id");
  assert(!approval.error && approval.data?.length === 2, "host approves automatic opening entries");
  const settling = await host.from("games").update({ status: "settling" }).eq("id", gameId).select("id");
  assert(!settling.error && settling.data?.length === 1, "game enters settlement");
  const cashOuts = await Promise.all([
    [hostPlayerId, 10],
    [playerA, 20],
    [playerB, 20],
  ].map(([playerId, amount]) => host.rpc("save_cash_out", {
    input_game_id: gameId,
    input_player_id: playerId,
    input_amount: amount,
    input_operation_key: randomUUID(),
  })));
  assert(cashOuts.every((cashOut) => !cashOut.error && cashOut.data), "cash-outs establish a $10 shortage borne only by host");

  async function setAllocation(allocation: Record<string, unknown>) {
    const saved = await host.from("games").update({ discrepancy_allocation: allocation }).eq("id", gameId).select("id");
    assert(!saved.error && saved.data?.length === 1, "host can save an allocation draft");
  }
  async function tryFinalize(label: string) {
    await expectRejected(
      () => host.from("games").update({ status: "ended" }).eq("id", gameId).eq("status", "settling").select("id"),
      label,
    );
  }

  await setAllocation({ method: "selected", player_ids: [playerA], amount: 10 });
  await tryFinalize("selected allocation rejects an ineligible player");
  await setAllocation({ method: "custom", player_ids: [hostPlayerId], player_allocations: [{ player_id: hostPlayerId, amount: 11 }], amount: 10 });
  await tryFinalize("custom allocation rejects an amount above eligible capacity");
  await setAllocation({ method: "custom", player_ids: [playerA], player_allocations: [{ player_id: hostPlayerId, amount: 10 }], amount: 10 });
  await tryFinalize("custom allocation requires matching participant ids");

  await setAllocation({ method: "custom", player_ids: [hostPlayerId], player_allocations: [{ player_id: hostPlayerId, amount: 10 }], amount: 10 });
  const finalized = await host.from("games").update({ status: "ended" }).eq("id", gameId).eq("status", "settling").select("id");
  assert(!finalized.error && finalized.data?.length === 1, "eligible custom allocation finalizes the balanced plan");
  await expectRejected(
    () => host.from("games").update({ status: "settling" }).eq("id", gameId).select("id"),
    "a finalized game cannot reopen",
  );
  console.log("✓ settlement allocation guards reject malformed capacity/participants and finalized games cannot reopen");
}

try {
  await run();
} finally {
  for (const gameId of games) await admin.from("games").delete().eq("id", gameId);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}
