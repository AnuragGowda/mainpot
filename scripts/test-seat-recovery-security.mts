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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const status = localStatus();
const url = status.API_URL;
const anonKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase credentials are incomplete.");

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const clients: SupabaseClient[] = [];
const games: string[] = [];
const users: string[] = [];

async function guest(label: string) {
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInAnonymously({ options: { data: { display_name: label } } });
  if (error) throw error;
  assert(data.user, `${label} receives an authenticated user`);
  clients.push(client);
  users.push(data.user.id);
  return client;
}

async function createGame(client: SupabaseClient, name: string) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  const { data, error } = await client.rpc("create_game_guarded", {
    input_code: code,
    input_game_name: name,
    input_host_name: name,
    input_buy_in: 20,
    input_session_id: randomUUID(),
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { game_id: string; player_id: string; code: string } | null;
  assert(row?.game_id && row.player_id && row.code, "game creation returns ids and code");
  games.push(row.game_id);
  return row;
}

async function join(client: SupabaseClient, code: string, name: string) {
  const sessionId = randomUUID();
  const { data, error } = await client.rpc("join_game_guarded", {
    input_code: code,
    input_player_name: name,
    input_session_id: sessionId,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { player_id: string } | null;
  assert(row?.player_id, `${name} joins the game`);
  return { playerId: row.player_id, sessionId };
}

async function expectError(operation: () => PromiseLike<{ data: unknown; error: unknown }>, label: string) {
  const result = await operation();
  assert(result.error, `${label} is rejected`);
}

async function expectPatchRejected(operation: () => PromiseLike<{ data: unknown; error: unknown }>, label: string) {
  const result = await operation();
  const rows = result.data as { id?: string } | { id?: string }[] | null;
  assert(
    result.error || rows === null || (Array.isArray(rows) && rows.length === 0),
    `${label} is rejected without changing the departed seat`,
  );
}

function restore(client: SupabaseClient, gameId: string, playerId: string) {
  return client.rpc("restore_player_to_table", {
    input_game_id: gameId,
    input_player_id: playerId,
  });
}

function patchReturn(client: SupabaseClient, playerId: string) {
  return client.from("players")
    .update({ left_at: null })
    .eq("id", playerId)
    .select("id")
    .maybeSingle();
}

async function markLeft(client: SupabaseClient, playerId: string) {
  const { data, error } = await client
    .from("players")
    .update({ left_at: new Date().toISOString() })
    .eq("id", playerId)
    .select("id, left_at")
    .single();
  if (error) throw error;
  assert(data?.left_at, "the player leaves the active game");
  return data.left_at as string;
}

async function approveOpeningBuyIn(host: SupabaseClient, gameId: string, playerId: string) {
  const { data, error } = await host.from("buy_ins")
    .update({ verified: true })
    .eq("game_id", gameId)
    .eq("player_id", playerId)
    .select("id")
    .single();
  if (error) throw error;
  assert(data?.id, "host confirms the player's opening buy-in");
}

async function run() {
  const host = await guest("Seat return host");
  const playerClient = await guest("Seat return player");
  const requestedPlayerClient = await guest("Pending exit player");
  const lockedPlayerClient = await guest("Locked exit player");
  const outsider = await guest("Seat return outsider");
  const otherHost = await guest("Other game host");
  const unauthenticated = createClient(url, anonKey, { auth: { persistSession: false } });
  clients.push(unauthenticated);

  const game = await createGame(host, "Seat return assurance");
  const player = await join(playerClient, game.code, "Jordan");
  await markLeft(playerClient, player.playerId);
  const originalPlayer = await admin.from("players")
    .select("id, game_id, user_id, session_id, name, is_host, joined_at, left_at")
    .eq("id", player.playerId)
    .single();
  assert(!originalPlayer.error && originalPlayer.data?.left_at, "departed seat is available to host review");
  const originalBuyIns = await admin.from("buy_ins")
    .select("id, amount, type, verified")
    .eq("game_id", game.game_id)
    .eq("player_id", player.playerId)
    .order("created_at");
  assert(!originalBuyIns.error && originalBuyIns.data?.length === 1, "departed player has one original opening entry");

  await expectPatchRejected(() => patchReturn(playerClient, player.playerId), "departed player direct self PATCH");
  await expectPatchRejected(() => patchReturn(host, player.playerId), "host direct PATCH without the restore RPC");
  await expectError(() => restore(playerClient, game.game_id, player.playerId), "departed player self-restoration");
  await expectError(() => restore(outsider, game.game_id, player.playerId), "unrelated user restoration");
  await expectError(() => restore(host, game.game_id, game.player_id), "host restoration through player return");
  await expectError(() => restore(host, game.game_id, "00000000-0000-0000-0000-000000000000"), "unknown seat restoration");
  await expectError(() => restore(unauthenticated, game.game_id, player.playerId), "unauthenticated seat restoration");

  const concurrentRetries = await Promise.all([
    restore(host, game.game_id, player.playerId),
    restore(host, game.game_id, player.playerId),
  ]);
  assert(concurrentRetries.every((response) => !response.error), "concurrent host retries both return successfully");
  const restoredPlayer = await admin.from("players")
    .select("id, game_id, user_id, session_id, name, is_host, joined_at, left_at")
    .eq("id", player.playerId)
    .single();
  assert(
    !restoredPlayer.error
      && restoredPlayer.data?.left_at === null
      && restoredPlayer.data.id === originalPlayer.data.id
      && restoredPlayer.data.user_id === originalPlayer.data.user_id
      && restoredPlayer.data.session_id === originalPlayer.data.session_id
      && restoredPlayer.data.name === originalPlayer.data.name
      && restoredPlayer.data.joined_at === originalPlayer.data.joined_at,
    "return clears only left_at and preserves the original player identity",
  );
  const restoredBuyIns = await admin.from("buy_ins")
    .select("id, amount, type, verified")
    .eq("game_id", game.game_id)
    .eq("player_id", player.playerId)
    .order("created_at");
  assert(
    !restoredBuyIns.error
      && JSON.stringify(restoredBuyIns.data) === JSON.stringify(originalBuyIns.data),
    "return preserves every original financial entry",
  );
  const joinEvents = await admin.from("game_events")
    .select("actor_player_id, subject_player_id, metadata")
    .eq("game_id", game.game_id)
    .eq("event_type", "player_joined")
    .eq("subject_player_id", player.playerId);
  const returnedEvents = joinEvents.data?.filter((event) => event.metadata?.returned_to_table === true) ?? [];
  assert(
    !joinEvents.error
      && joinEvents.data?.length === 2
      && returnedEvents.length === 1
      && returnedEvents[0].actor_player_id === game.player_id
      && returnedEvents[0].subject_player_id === player.playerId,
    "host return is transactionally audited once despite concurrent retries",
  );
  console.log("✓ host return restores one original seat and audit event without changing its ledger");

  const pendingPlayer = await join(requestedPlayerClient, game.code, "Pending return");
  await approveOpeningBuyIn(host, game.game_id, pendingPlayer.playerId);
  const pendingRequest = await host.rpc("request_early_cash_out", {
    input_game_id: game.game_id,
    input_player_id: pendingPlayer.playerId,
    input_cash_out_amount: 10,
    input_session_id: pendingPlayer.sessionId,
  });
  assert(!pendingRequest.error && pendingRequest.data?.id, "host creates a pending early cash-out request");
  await markLeft(requestedPlayerClient, pendingPlayer.playerId);
  await expectPatchRejected(() => patchReturn(host, pendingPlayer.playerId), "host PATCH with a requested early cash-out");
  await expectError(() => restore(host, game.game_id, pendingPlayer.playerId), "return with a requested early cash-out");

  const lockedPlayer = await join(lockedPlayerClient, game.code, "Locked return");
  await approveOpeningBuyIn(host, game.game_id, lockedPlayer.playerId);
  const lockedRequest = await host.rpc("request_early_cash_out", {
    input_game_id: game.game_id,
    input_player_id: lockedPlayer.playerId,
    input_cash_out_amount: 10,
    input_session_id: lockedPlayer.sessionId,
  });
  assert(!lockedRequest.error && lockedRequest.data?.id, "host creates an early cash-out to lock");
  const locked = await host.rpc("approve_early_cash_out", { input_early_cash_out_id: lockedRequest.data.id });
  assert(!locked.error && locked.data?.status === "locked", "early cash-out can be locked");
  await expectPatchRejected(() => patchReturn(host, lockedPlayer.playerId), "host PATCH with a locked early cash-out");
  await expectError(() => restore(host, game.game_id, lockedPlayer.playerId), "return with a locked early cash-out");

  const capacityCandidateClient = await guest("At-capacity return candidate");
  const capacityCandidate = await join(capacityCandidateClient, game.code, "At-capacity candidate");
  await markLeft(capacityCandidateClient, capacityCandidate.playerId);
  const [{ data: config, error: configError }, { count: activeCount, error: countError }] = await Promise.all([
    admin.from("app_config").select("max_players_per_game").eq("id", true).single(),
    admin.from("players").select("id", { count: "exact", head: true }).eq("game_id", game.game_id).is("left_at", null),
  ]);
  if (configError) throw configError;
  if (countError) throw countError;
  const playerLimit = Number(config?.max_players_per_game ?? 12);
  assert(activeCount !== null && activeCount < playerLimit, "the table has room to create a full-roster fixture");
  for (let index = 0; index < playerLimit - activeCount; index += 1) {
    const fullRosterGuest = await guest(`Full roster guest ${index + 1}`);
    await join(fullRosterGuest, game.code, `Full roster ${index + 1}`);
  }
  await expectPatchRejected(() => patchReturn(host, capacityCandidate.playerId), "host PATCH at the player limit");
  await expectError(() => restore(host, game.game_id, capacityCandidate.playerId), "host return at the player limit");

  const closedGame = await createGame(otherHost, "Closed seat return assurance");
  const closedPlayerClient = await guest("Closed seat return player");
  const closedPlayer = await join(closedPlayerClient, closedGame.code, "Closed player");
  await approveOpeningBuyIn(otherHost, closedGame.game_id, closedPlayer.playerId);
  await markLeft(closedPlayerClient, closedPlayer.playerId);
  const close = await otherHost.from("games").update({ status: "settling" }).eq("id", closedGame.game_id);
  assert(!close.error, "host closes the table");
  await expectPatchRejected(() => patchReturn(otherHost, closedPlayer.playerId), "host PATCH after the active phase closes");
  await expectError(() => restore(otherHost, closedGame.game_id, closedPlayer.playerId), "return after active phase closes");

  console.log("✓ self-service, unrelated, cash-out, and closed-ledger seat returns are rejected");
}

try {
  console.log("Running isolated seat-recovery database assurance…");
  await run();
  console.log("Seat-recovery assurance passed.");
} finally {
  for (const gameId of games) await admin.from("games").delete().eq("id", gameId);
  for (const client of clients) await client.auth.signOut();
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}
