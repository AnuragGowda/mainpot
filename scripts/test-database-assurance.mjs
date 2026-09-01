import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseCommand = process.platform === "win32" ? "supabase.cmd" : "supabase";

function localStatus() {
  const status = JSON.parse(execFileSync(supabaseCommand, ["status", "--output", "json"], { encoding: "utf8" }));
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(status.API_URL ?? "")) {
    throw new Error(`Refusing to run against non-local Supabase URL: ${status.API_URL}`);
  }
  return status;
}

const status = localStatus();
const url = status.API_URL;
const anonKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase credentials are incomplete.");

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const clients = [];
const games = [];
const users = [];

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function guest(label) {
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInAnonymously({ options: { data: { display_name: label } } });
  if (error) throw error;
  clients.push(client);
  users.push(data.user.id);
  return client;
}

async function createGame(client, name) {
  const code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 30)]).join("");
  const { data, error } = await client.rpc("create_game_guarded", {
    input_code: code,
    input_game_name: name,
    input_host_name: name,
    input_buy_in: 20,
    input_session_id: randomUUID(),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  assert(row?.game_id && row?.player_id, "guarded game creation returns ids");
  games.push(row.game_id);
  return row;
}

async function join(client, code, name) {
  const { data, error } = await client.rpc("join_game_guarded", {
    input_code: code,
    input_player_name: name,
    input_session_id: randomUUID(),
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function expectError(operation, label) {
  const result = await operation();
  assert(result.error || !result.data?.length, `${label} is rejected`);
  return result.error;
}

async function run() {
  console.log("Running local database assurance checks…");
  const host = await guest("Assurance host");
  const guestA = await guest("Assurance guest A");
  const guestB = await guest("Assurance guest B");
  const otherHost = await guest("Other game host");
  const outsider = await guest("Game A outsider");

  const gameA = await createGame(host, "Assurance game A");
  const gameB = await createGame(otherHost, "Assurance game B");
  const playerA = await join(guestA, gameA.code, "Guest A");
  const playerB = await join(guestB, gameA.code, "Guest B");
  const otherPlayer = await join(guestB, gameB.code, "Other player");

  const otherGameBuyIn = await otherHost.rpc("create_buy_in_idempotent", {
    input_game_id: gameB.game_id,
    input_player_id: otherPlayer.player_id,
    input_amount: 12,
    input_type: "buy_in",
    input_fronted_by_player_id: null,
    input_operation_key: randomUUID(),
  });
  assert(!otherGameBuyIn.error && otherGameBuyIn.data?.[0]?.id, "other game buy-in fixture is created");
  const otherGameBuyInId = otherGameBuyIn.data[0].id;
  const otherGameCashOut = await otherHost.from("cash_outs").insert({
    game_id: gameB.game_id,
    player_id: otherPlayer.player_id,
    amount: 12,
  }).select("id");
  assert(!otherGameCashOut.error && otherGameCashOut.data?.[0]?.id, "other game cash-out fixture is created");

  const operationKey = randomUUID();
  const first = await guestA.rpc("create_buy_in_idempotent", {
    input_game_id: gameA.game_id,
    input_player_id: playerA.player_id,
    input_amount: 15,
    input_type: "buy_in",
    input_fronted_by_player_id: null,
    input_operation_key: operationKey,
  });
  assert(!first.error && first.data?.length === 1 && first.data[0].created === true, "first idempotent buy-in is created");
  const second = await guestA.rpc("create_buy_in_idempotent", {
    input_game_id: gameA.game_id,
    input_player_id: playerA.player_id,
    input_amount: 15,
    input_type: "buy_in",
    input_fronted_by_player_id: null,
    input_operation_key: operationKey,
  });
  assert(!second.error && second.data?.length === 1 && second.data[0].created === false, "retry returns the original buy-in");
  assert(second.data[0].id === first.data[0].id, "retry returns the same buy-in id");
  const mismatch = await guestA.rpc("create_buy_in_idempotent", {
    input_game_id: gameA.game_id,
    input_player_id: playerA.player_id,
    input_amount: 16,
    input_type: "buy_in",
    input_fronted_by_player_id: null,
    input_operation_key: operationKey,
  });
  assert(mismatch.error, "operation key reused with different inputs is rejected");
  console.log("✓ idempotent buy-in create/retry/mismatch");
  const guestBuyIn = first.data[0];

  await expectError(
    () => guestA.from("buy_ins").insert({ game_id: gameB.game_id, player_id: otherPlayer.player_id, amount: 12, type: "buy_in" }),
    "cross-game buy-in insert",
  );
  await expectError(
    () => guestA.from("cash_outs").insert({ game_id: gameB.game_id, player_id: otherPlayer.player_id, amount: 12 }),
    "cross-game cash-out insert",
  );
  await expectError(
    () => guestA.from("buy_ins").update({ amount: 99 }).eq("id", otherGameBuyInId).select("id"),
    "cross-game buy-in update",
  );
  await expectError(
    () => guestA.from("cash_outs").update({ amount: 99 }).eq("id", otherGameCashOut.data[0].id).select("id"),
    "cross-game cash-out update",
  );
  const hidden = await guestA.from("buy_ins").select("id").eq("game_id", gameB.game_id);
  assert(!hidden.error && hidden.data?.length === 0, "cross-game buy-ins are not readable");
  console.log("✓ cross-game reads and writes are denied");

  const protectedTables = ["players", "buy_ins", "cash_outs", "game_events", "settlement_payments"];
  for (const table of protectedTables) {
    const { data, error } = await outsider.from(table).select("id").eq("game_id", gameA.game_id);
    assert(!error && data?.length === 0, `outsider cannot read Game A ${table}`);
  }
  const hiddenGame = await outsider.from("games").select("id").eq("id", gameA.game_id);
  assert(!hiddenGame.error && hiddenGame.data?.length === 0, "outsider cannot read Game A");
  await expectError(
    () => outsider.from("players").update({ name: "Intruder" }).eq("id", playerA.player_id).select("id"),
    "outsider player update",
  );
  await expectError(
    () => outsider.from("buy_ins").update({ amount: 99 }).eq("id", guestBuyIn.id).select("id"),
    "outsider buy-in update",
  );
  await expectError(
    () => outsider.from("cash_outs").update({ amount: 99 }).eq("id", otherGameCashOut.data[0].id).select("id"),
    "outsider cash-out update",
  );
  await expectError(
    () => outsider.rpc("transfer_game_host", { target_game_id: gameA.game_id, target_player_id: playerA.player_id }),
    "outsider host transfer",
  );
  console.log("✓ non-member room reads and mutations are denied");

  await expectError(
    () => guestB.from("buy_ins").update({ verified: true }).eq("id", guestBuyIn.id).select("id"),
    "non-host verification of another player's buy-in",
  );
  await expectError(
    () => guestB.from("buy_ins").update({ amount: 99 }).eq("id", guestBuyIn.id).select("id"),
    "non-host edit of another player's buy-in",
  );
  await expectError(
    () => guestB.from("buy_ins").delete().eq("id", guestBuyIn.id).select("id"),
    "non-host removal of another player's buy-in",
  );
  const transfer = await guestB.rpc("transfer_game_host", { target_game_id: gameA.game_id, target_player_id: playerB.player_id });
  assert(transfer.error, "non-host host transfer");
  console.log("✓ non-host approval/edit/remove/transfer protections");

  // Verify the canonical row with a separate service-role read. An RLS actor
  // can receive zero returned rows even when a mutation was applied.
  const probe = await guestA.from("buy_ins").update({ game_id: gameB.game_id }).eq("id", guestBuyIn.id).select("id");
  const { data: canonicalRow, error: canonicalError } = await admin
    .from("buy_ins")
    .select("game_id, player_id")
    .eq("id", guestBuyIn.id)
    .maybeSingle();
  assert(!canonicalError && canonicalRow, "canonical buy-in row remains queryable for the probe");
  if (canonicalRow.game_id !== gameA.game_id || canonicalRow.player_id !== playerA.player_id) {
    console.error("SECURITY FINDING: owner can move a buy-in row into another game by changing game_id.");
    console.error("The RLS update policy checks player ownership but does not enforce game_id/player_id immutability.");
    throw new Error("Cross-game buy-in UPDATE mutation is permitted");
  }
  console.log("✓ cross-game row-rewrite probe is denied");
}

try {
  await run();
  console.log("Database assurance passed.");
} finally {
  for (const gameId of games) await admin.from("games").delete().eq("id", gameId);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}
