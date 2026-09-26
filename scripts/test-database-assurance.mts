// @ts-expect-error Node executes this TypeScript script directly and requires the extension.
import { applyFundingAdjustments, applyDiscrepancyAllocation, calculateMinTransfers } from "../lib/settlement.ts";
import type { BuyIn } from "../lib/types.ts";
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
const clients: SupabaseClient[] = [];
const games: string[] = [];
const users: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function guest(label: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInAnonymously({ options: { data: { display_name: label } } });
  if (error) throw error;
  assert(data.user, `${label} receives an authenticated user`);
  clients.push(client);
  users.push(data.user.id);
  return client;
}

async function createGame(client: SupabaseClient, name: string) {
  const code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 30)]).join("");
  const { data, error } = await client.rpc("create_game_guarded", {
    input_code: code,
    input_game_name: name,
    input_host_name: name,
    input_buy_in: 20,
    input_session_id: randomUUID(),
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as {
    game_id: string;
    player_id: string;
    code: string;
  } | null;
  assert(row?.game_id && row?.player_id, "guarded game creation returns ids");
  games.push(row.game_id);
  return row;
}

async function join(client: SupabaseClient, code: string, name: string, sessionId = randomUUID()) {
  const { data, error } = await client.rpc("join_game_guarded", {
    input_code: code,
    input_player_name: name,
    input_session_id: sessionId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function expectError(
  operation: () => PromiseLike<{ data: unknown; error: unknown }>,
  label: string,
) {
  const result = await operation();
  const data = result.data as { length?: number } | null;
  assert(result.error || !data?.length, `${label} is rejected`);
  return result.error;
}

async function verifyHostManagedPlayers() {
  const host = await guest("Host-managed assurance host");
  const participant = await guest("Host-managed assurance player");
  const outsider = await guest("Host-managed assurance outsider");
  const game = await createGame(host, "Host-managed assurance");
  const participantSession = randomUUID();
  const joinedParticipant = await join(participant, game.code, "Independent player", participantSession);
  const joinedEntries = await participant.from("buy_ins").select("id, amount, verified").eq("player_id", joinedParticipant.player_id);
  assert(
    joinedEntries.data?.length === 1 && Number(joinedEntries.data[0].amount) === 20 && !joinedEntries.data[0].verified,
    "joining atomically creates one pending opening buy-in",
  );
  const joinedRetry = await join(participant, game.code, "Independent player", participantSession);
  const joinedEntriesAfterRetry = await participant.from("buy_ins").select("id").eq("player_id", joinedParticipant.player_id);
  assert(
    joinedRetry?.player_id === joinedParticipant.player_id && joinedEntriesAfterRetry.data?.length === 1,
    "rejoining returns the seat without duplicating its opening buy-in",
  );
  const input = { input_game_id: game.game_id, input_name: "Phone-free player", input_buy_in: 20, input_operation_key: randomUUID() };
  await expectError(() => participant.rpc("add_host_player", input), "non-host adding players");
  await expectError(() => outsider.rpc("add_host_player", input), "outsider adding players");
  const unauthenticated = createClient(url, anonKey, { auth: { persistSession: false } });
  await expectError(() => unauthenticated.rpc("add_host_player", input), "unauthenticated player creation");
  const responses = await Promise.all(Array.from({ length: 3 }, () => host.rpc("add_host_player", input)));
  assert(responses.every((response) => !response.error), "concurrent host-add retries succeed");
  const player = responses[0].data;
  assert(player?.id && responses.every((response) => response.data?.id === player.id), "retries return the same seat");
  assert(player.session_id === null && player.user_id === null && player.is_host === false, "host-managed seat has no caller identity");
  const entries = await host.from("buy_ins").select("id, amount, verified").eq("player_id", player.id);
  assert(entries.data?.length === 1 && Number(entries.data[0].amount) === 20 && entries.data[0].verified, "opening buy-in is verified and never duplicated");
  const events = await host.from("game_events").select("actor_player_id").eq("subject_player_id", player.id);
  assert(events.data?.length === 2 && events.data.every((event) => event.actor_player_id === game.player_id), "creation and opening buy-in are audited as host actions exactly once");
  await expectError(() => host.rpc("add_host_player", { ...input, input_name: "Changed name" }), "conflicting host-add retry name");
  await expectError(() => host.rpc("add_host_player", { ...input, input_buy_in: 25 }), "conflicting host-add retry amount");
  await expectError(() => host.rpc("add_host_player", { ...input, input_operation_key: randomUUID(), input_buy_in: -1 }), "negative host opening buy-in");
  await expectError(() => host.rpc("add_host_player", { ...input, input_operation_key: randomUUID(), input_name: "X".repeat(33) }), "overlong host-added name");
  await expectError(() => host.rpc("transfer_game_host", { target_game_id: game.game_id, target_player_id: player.id }), "host transfer to a phone-free player");
  const zero = await host.rpc("add_host_player", { ...input, input_name: "No buy-in yet", input_buy_in: 0, input_operation_key: randomUUID() });
  assert(!zero.error && zero.data?.id, "host adds a player before buy-in");
  const zeroEntries = await host.from("buy_ins").select("id").eq("player_id", zero.data.id);
  assert(zeroEntries.data?.length === 0, "zero opening creates no ledger entry");
  const rebuy = await host.rpc("create_buy_in_idempotent", { input_game_id: game.game_id, input_player_id: player.id, input_amount: 5, input_type: "rebuy", input_fronted_by_player_id: null, input_operation_key: randomUUID() });
  assert(!rebuy.error && rebuy.data?.[0]?.verified, "host records a verified rebuy for a managed player");
  await expectError(() => participant.rpc("create_buy_in_idempotent", { input_game_id: game.game_id, input_player_id: player.id, input_amount: 5, input_type: "rebuy", input_fronted_by_player_id: null, input_operation_key: randomUUID() }), "participant recording a managed player's buy-in");
  await expectError(() => participant.rpc("join_game_guarded", { input_code: game.code, input_player_name: player.name, input_session_id: null }), "null-session seat claiming");
  const cashOutInput = { input_game_id: game.game_id, input_player_id: player.id, input_cash_out_amount: 15, input_session_id: randomUUID() };
  await expectError(() => participant.rpc("request_early_cash_out", cashOutInput), "participant requesting a managed player's cash-out");
  await expectError(() => participant.rpc("request_early_cash_out", { ...cashOutInput, input_session_id: null }), "null-session cash-out impersonation");
  const early = await host.rpc("request_early_cash_out", cashOutInput);
  assert(!early.error && early.data?.id, "host requests a managed player's early cash-out");
  await expectError(() => participant.rpc("cancel_early_cash_out", { input_early_cash_out_id: early.data.id, input_session_id: participantSession }), "participant cancelling managed cash-out");
  const locked = await host.rpc("approve_early_cash_out", { input_early_cash_out_id: early.data.id });
  assert(!locked.error && locked.data?.status === "locked", "host locks managed cash-out");
  await expectError(() => participant.rpc("set_early_cash_out_payment_status", { input_early_cash_out_id: early.data.id, input_settled: true, input_session_id: participantSession }), "unrelated participant marking managed payment");
  const payment = await host.rpc("set_early_cash_out_payment_status", { input_early_cash_out_id: early.data.id, input_settled: true, input_session_id: randomUUID() });
  assert(!payment.error, "host marks managed early payment");
  const participantApproval = await host
    .from("buy_ins")
    .update({ verified: true })
    .eq("game_id", game.game_id)
    .eq("player_id", joinedParticipant.player_id)
    .select("id, verified")
    .single();
  assert(!participantApproval.error && participantApproval.data?.verified, "host approves the participant opening buy-in before settlement");
  const closing = await host.from("games").update({ status: "settling" }).eq("id", game.game_id);
  assert(!closing.error, "host closes managed table");
  await expectError(() => host.rpc("add_host_player", { ...input, input_operation_key: randomUUID() }), "adding players after active ledger closes");
  console.log("✓ host-managed seats are atomic, retry-safe, host-only, and compatible with early exits");
}

async function verifyOptionalHostOpeningBuyIn() {
  const host = await guest("Host without opening buy-in");
  const participant = await guest("Optional host participant");
  const code = "HAST42";
  const sessionId = randomUUID();
  const { data, error } = await host.rpc("create_game_guarded", {
    input_code: code,
    input_game_name: "Optional host opening buy-in",
    input_host_name: "Casey",
    input_buy_in: 20,
    input_session_id: sessionId,
    input_host_is_playing: false,
  });
  const game = (Array.isArray(data) ? data[0] : data) as {
    game_id: string;
    player_id: string;
  } | null;
  assert(!error && game?.game_id && game.player_id, "non-playing host game is created by guarded RPC");
  games.push(game.game_id);

  const openingEntries = await host.from("buy_ins").select("id").eq("player_id", game.player_id);
  assert(openingEntries.data?.length === 0, "non-playing host creates no opening monetary entry");
  const openingEvents = await host
    .from("game_events")
    .select("event_type")
    .eq("game_id", game.game_id)
    .eq("event_type", "buy_in_added");
  assert(openingEvents.data?.length === 0, "non-playing host creates no opening buy-in event");

  const joined = await join(participant, code, "Jordan");
  assert(joined?.player_id, "guests can join a game hosted without an opening buy-in");
  const laterBuyIn = await host.rpc("create_buy_in_idempotent", {
    input_game_id: game.game_id,
    input_player_id: game.player_id,
    input_amount: 20,
    input_type: "buy_in",
    input_fronted_by_player_id: null,
    input_operation_key: randomUUID(),
  });
  assert(!laterBuyIn.error && laterBuyIn.data?.[0]?.verified, "host can buy in later from the same control identity");

  const autoZeroHost = await guest("Automatic zero cash-out host");
  const autoZero = await autoZeroHost.rpc("create_game_guarded", {
    input_code: "CASH42",
    input_game_name: "Automatic zero cash-out",
    input_host_name: "Morgan",
    input_buy_in: 20,
    input_session_id: randomUUID(),
    input_host_is_playing: false,
  });
  const autoZeroGame = (Array.isArray(autoZero.data) ? autoZero.data[0] : autoZero.data) as {
    game_id: string;
    player_id: string;
  } | null;
  assert(!autoZero.error && autoZeroGame?.game_id && autoZeroGame.player_id, "zero cash-out host game is created");
  games.push(autoZeroGame.game_id);
  const startSettlement = await autoZeroHost
    .from("games")
    .update({ status: "settling" })
    .eq("id", autoZeroGame.game_id)
    .eq("status", "active");
  assert(!startSettlement.error, "host can start settlement without an opening buy-in");
  const zeroCashOut = await autoZeroHost
    .from("cash_outs")
    .select("amount")
    .eq("player_id", autoZeroGame.player_id);
  assert(zeroCashOut.data?.length === 1 && Number(zeroCashOut.data[0].amount) === 0, "untouched host is reconciled at zero when settlement starts");
  console.log("✓ non-playing hosts retain controls, admit guests, buy in later, and reconcile at zero");
}

async function run() {
  console.log("Running local database assurance checks…");
  const host = await guest("Assurance host");
  const guestA = await guest("Assurance guest A");
  const rotatedGuestA = await guest("Assurance guest A rotated auth");
  const guestB = await guest("Assurance guest B");
  const otherHost = await guest("Other game host");
  const outsider = await guest("Game A outsider");
  const handoffHost = await guest("Handoff host");
  const handoffGuest = await guest("Handoff guest");
  const earlyHost = await guest("Early cash-out host");
  const earlyGuest = await guest("Early cash-out guest");

  await expectError(
    () => host.rpc("create_game_guarded", {
      input_code: "NAME42",
      input_game_name: "G".repeat(41),
      input_host_name: "Casey",
      input_buy_in: 20,
      input_session_id: randomUUID(),
    }),
    "41-character game name",
  );
  await expectError(
    () => host.rpc("create_game_guarded", {
      input_code: "HAST42",
      input_game_name: "Compact game",
      input_host_name: "P".repeat(33),
      input_buy_in: 20,
      input_session_id: randomUUID(),
    }),
    "33-character host name",
  );
  console.log("✓ compact game and host name limits are enforced");

  const gameA = await createGame(host, "Assurance game A");
  const gameB = await createGame(otherHost, "Assurance game B");
  const playerASessionId = randomUUID();
  const playerA = await join(guestA, gameA.code, "Guest A", playerASessionId);
  await expectError(
    () => rotatedGuestA.rpc("join_game_guarded", {
      input_code: gameA.code, input_player_name: "Guest A", input_session_id: playerASessionId,
    }),
    "a copied browser session cannot resume another authenticated player",
  );
  const resumedPlayerA = await join(guestA, gameA.code, "Guest A", randomUUID());
  assert(resumedPlayerA.player_id === playerA.player_id,
    "the authenticated owner resumes the same seat across browser sessions");
  const playerB = await join(guestB, gameA.code, "Guest B");
  const otherPlayer = await join(guestB, gameB.code, "Other player");

  await expectError(
    () => host.from("players").update({ left_at: new Date().toISOString() }).eq("id", gameA.player_id).select("id"),
    "host leaving without a replacement",
  );

  const handoffGame = await createGame(handoffHost, "Host handoff assurance");
  const handoffPlayer = await join(handoffGuest, handoffGame.code, "Handoff guest");
  const handoff = await handoffHost.rpc("transfer_host_and_leave_game", {
    target_game_id: handoffGame.game_id,
    target_player_id: handoffPlayer.player_id,
  });
  assert(!handoff.error, "host can transfer and leave together");
  const { data: handoffState, error: handoffStateError } = await admin
    .from("players")
    .select("id, is_host, left_at")
    .eq("game_id", handoffGame.game_id);
  assert(
    !handoffStateError
      && handoffState?.some((player) => player.id === handoffGame.player_id && !player.is_host && player.left_at)
      && handoffState?.some((player) => player.id === handoffPlayer.player_id && player.is_host && !player.left_at),
    "host transfer and departure leave exactly the selected player active as host",
  );
  console.log("✓ hosts must choose an active successor before leaving");

  const earlyGame = await createGame(earlyHost, "Early cash-out assurance");
  const earlyPlayerSessionId = randomUUID();
  const earlyPlayer = await join(
    earlyGuest,
    earlyGame.code,
    "Early guest",
    earlyPlayerSessionId,
  );
  const { data: earlyBuyIn, error: earlyBuyInError } = await earlyHost
    .from("buy_ins")
    .select("id, amount, verified")
    .eq("player_id", earlyPlayer.player_id)
    .single();
  assert(!earlyBuyInError && earlyBuyIn?.id && Number(earlyBuyIn.amount) === 20 && !earlyBuyIn.verified, "early join creates one pending player buy-in");
  const earlyApproval = await earlyHost
    .from("buy_ins")
    .update({ verified: true })
    .eq("id", earlyBuyIn.id)
    .select("id, verified")
    .single();
  assert(!earlyApproval.error && earlyApproval.data.verified, "host verifies early player buy-in");

  const earlyRequest = await earlyGuest.rpc("request_early_cash_out", {
    input_game_id: earlyGame.game_id,
    input_player_id: earlyPlayer.player_id,
    input_cash_out_amount: 30,
    input_session_id: earlyPlayerSessionId,
  });
  assert(
    !earlyRequest.error
      && earlyRequest.data?.status === "requested"
      && Number(earlyRequest.data.cash_out_amount) === 30,
    "player can request an early cash-out",
  );
  await expectError(
    () => earlyGuest.rpc("approve_early_cash_out", {
      input_early_cash_out_id: earlyRequest.data.id,
    }),
    "player approving their own early cash-out",
  );
  await expectError(
    () => outsider.rpc("approve_early_cash_out", {
      input_early_cash_out_id: earlyRequest.data.id,
    }),
    "outsider approving an early cash-out",
  );
  const lockedEarlyCashOut = await earlyHost.rpc("approve_early_cash_out", {
    input_early_cash_out_id: earlyRequest.data.id,
  });
  assert(
    !lockedEarlyCashOut.error
      && lockedEarlyCashOut.data?.status === "locked"
      && lockedEarlyCashOut.data.bank_player_id === earlyGame.player_id
      && Number(lockedEarlyCashOut.data.net_amount) === 10,
    "host locks a +$10 early cash-out against the current host",
  );
  const { data: earlyPlayerState, error: earlyPlayerStateError } = await admin
    .from("players")
    .select("left_at")
    .eq("id", earlyPlayer.player_id)
    .single();
  assert(!earlyPlayerStateError && earlyPlayerState.left_at, "locked early player leaves the active roster");
  const { data: earlyCashOutRow, error: earlyCashOutRowError } = await admin
    .from("cash_outs")
    .select("amount")
    .eq("game_id", earlyGame.game_id)
    .eq("player_id", earlyPlayer.player_id)
    .single();
  assert(!earlyCashOutRowError && Number(earlyCashOutRow.amount) === 30, "locked final chips enter reconciliation");
  await expectError(
    () => earlyHost.from("buy_ins").update({ amount: 21 }).eq("id", earlyBuyIn.id).select("id"),
    "editing a buy-in after early cash-out lock",
  );
  await expectError(
    () => earlyHost.from("cash_outs").update({ amount: 31 }).eq("game_id", earlyGame.game_id).eq("player_id", earlyPlayer.player_id).select("id"),
    "editing final chips after early cash-out lock",
  );
  const earlyPayment = await earlyGuest.rpc("set_early_cash_out_payment_status", {
    input_early_cash_out_id: earlyRequest.data.id,
    input_settled: true,
    input_session_id: earlyPlayerSessionId,
  });
  assert(!earlyPayment.error, "departing player can mark the early payment complete");
  const { data: earlyPaymentRow, error: earlyPaymentRowError } = await admin
    .from("settlement_payments")
    .select("from_player_id, to_player_id, amount, mode, settled")
    .eq("game_id", earlyGame.game_id)
    .eq("mode", "early_exit")
    .single();
  assert(
    !earlyPaymentRowError
      && earlyPaymentRow.from_player_id === earlyGame.player_id
      && earlyPaymentRow.to_player_id === earlyPlayer.player_id
      && Number(earlyPaymentRow.amount) === 10
      && earlyPaymentRow.settled,
    "early winner receives one tracked host payment while the game stays active",
  );
  const { data: earlyGameState, error: earlyGameStateError } = await admin
    .from("games")
    .select("status")
    .eq("id", earlyGame.game_id)
    .single();
  assert(!earlyGameStateError && earlyGameState.status === "active", "early payment does not end the table");
  const hiddenEarlyCashOut = await outsider
    .from("early_cash_outs")
    .select("id")
    .eq("game_id", earlyGame.game_id);
  assert(!hiddenEarlyCashOut.error && hiddenEarlyCashOut.data?.length === 0, "outsider cannot read early cash-outs");
  console.log("✓ host-approved early cash-out locks chips, departure, and one active-game payment");

  await expectError(
    () => outsider.rpc("join_game_guarded", {
      input_code: gameA.code,
      input_player_name: "P".repeat(33),
      input_session_id: randomUUID(),
    }),
    "33-character player name",
  );
  await expectError(
    () => outsider.rpc("join_game_guarded", {
      input_code: gameA.code,
      input_player_name: "Line\nbreak",
      input_session_id: randomUUID(),
    }),
    "player name containing a line break",
  );
  console.log("✓ player names reject excess length and control characters");

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
  const otherOpeningApproval = await otherHost
    .from("buy_ins")
    .update({ verified: true })
    .eq("game_id", gameB.game_id)
    .eq("player_id", otherPlayer.player_id)
    .select("id, verified");
  assert(!otherOpeningApproval.error && otherOpeningApproval.data?.length && otherOpeningApproval.data.every((entry) => entry.verified), "other game opening buy-in is approved before settlement");
  const otherGameSettling = await otherHost
    .from("games")
    .update({ status: "settling", ended_at: new Date().toISOString() })
    .eq("id", gameB.game_id)
    .select("id");
  assert(!otherGameSettling.error && otherGameSettling.data?.[0]?.id, "other game enters settlement for its cash-out fixture");
  const concurrentCashOutAmount = 12;
  const hostCashOutOperationKey = randomUUID();
  const playerCashOutOperationKey = randomUUID();
  const [hostFirstCashOut, playerFirstCashOut] = await Promise.all([
    otherHost.rpc("save_cash_out", {
      input_game_id: gameB.game_id,
      input_player_id: otherPlayer.player_id,
      input_amount: concurrentCashOutAmount,
      input_operation_key: hostCashOutOperationKey,
    }),
    guestB.rpc("save_cash_out", {
      input_game_id: gameB.game_id,
      input_player_id: otherPlayer.player_id,
      input_amount: concurrentCashOutAmount,
      input_operation_key: playerCashOutOperationKey,
    }),
  ]);
  assert(!hostFirstCashOut.error && !playerFirstCashOut.error
    && hostFirstCashOut.data?.id && playerFirstCashOut.data?.id,
  "host and player can concurrently save the first final stack");
  const { data: concurrentCashOutRows, error: concurrentCashOutError } = await admin
    .from("cash_outs")
    .select("id, amount")
    .eq("game_id", gameB.game_id)
    .eq("player_id", otherPlayer.player_id);
  assert(!concurrentCashOutError && concurrentCashOutRows?.length === 1
    && Number(concurrentCashOutRows[0].amount) === concurrentCashOutAmount,
  "concurrent first cash-out saves leave one canonical row");
  const { data: firstCashOutEvents, error: firstCashOutEventsError } = await admin
    .from("game_events")
    .select("id")
    .eq("game_id", gameB.game_id)
    .eq("event_type", "cash_out_updated")
    .eq("subject_player_id", otherPlayer.player_id);
  assert(!firstCashOutEventsError && firstCashOutEvents?.length === 2,
    "the two independently authorized first-save operations are both audited");
  const hostCashOutRetry = await otherHost.rpc("save_cash_out", {
    input_game_id: gameB.game_id,
    input_player_id: otherPlayer.player_id,
    input_amount: concurrentCashOutAmount,
    input_operation_key: hostCashOutOperationKey,
  });
  const { data: retriedCashOutEvents, error: retriedCashOutEventsError } = await admin
    .from("game_events")
    .select("id")
    .eq("game_id", gameB.game_id)
    .eq("event_type", "cash_out_updated")
    .eq("subject_player_id", otherPlayer.player_id);
  assert(!hostCashOutRetry.error && hostCashOutRetry.data?.id === hostFirstCashOut.data.id
    && !retriedCashOutEventsError && retriedCashOutEvents?.length === 2,
  "a retried cash-out key returns the saved result without another activity event");

  const { data: appConfig, error: appConfigError } = await admin
    .from("app_config")
    .select("max_events_per_game")
    .eq("id", true)
    .single();
  assert(!appConfigError && typeof appConfig?.max_events_per_game === "number",
    "database assurance can restore the activity-limit fixture");
  const { count: existingGameBEventCount, error: existingGameBEventCountError } = await admin
    .from("game_events")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameB.game_id);
  assert(!existingGameBEventCountError && typeof existingGameBEventCount === "number",
    "activity-limit fixture can count existing game events");
  const eventLimitFloor = 25;
  const paddingCount = Math.max(0, eventLimitFloor - existingGameBEventCount);
  if (paddingCount > 0) {
    const paddingEvents = await admin.from("game_events").insert(Array.from({ length: paddingCount }, (_, index) => ({
      game_id: gameB.game_id,
      event_type: "cash_out_updated",
      actor_player_id: gameB.player_id,
      subject_player_id: otherPlayer.player_id,
      amount: 0,
      metadata: { fixture: "cash-out-activity-limit", index },
    })));
    assert(!paddingEvents.error, "activity-limit fixture reaches the minimum supported event limit");
  }
  const eventCountBeforeFailedCashOut = existingGameBEventCount + paddingCount;
  const failedCashOutOperationKey = randomUUID();
  try {
    const limitUpdate = await admin
      .from("app_config")
      .update({ max_events_per_game: eventCountBeforeFailedCashOut })
      .eq("id", true);
    assert(!limitUpdate.error, "activity-limit fixture is applied");
    const failedCashOut = await otherHost.rpc("save_cash_out", {
      input_game_id: gameB.game_id,
      input_player_id: otherPlayer.player_id,
      input_amount: 13,
      input_operation_key: failedCashOutOperationKey,
    });
    assert(failedCashOut.error, "a rejected activity insert rejects the cash-out transaction");
  } finally {
    const restoreLimit = await admin
      .from("app_config")
      .update({ max_events_per_game: appConfig.max_events_per_game })
      .eq("id", true);
    assert(!restoreLimit.error, "activity-limit fixture is restored");
  }
  const { data: rolledBackCashOut, error: rolledBackCashOutError } = await admin
    .from("cash_outs")
    .select("amount")
    .eq("game_id", gameB.game_id)
    .eq("player_id", otherPlayer.player_id)
    .single();
  assert(!rolledBackCashOutError && Number(rolledBackCashOut?.amount) === concurrentCashOutAmount,
    "a failed activity write rolls back the cash-out value");
  const recoveredCashOut = await otherHost.rpc("save_cash_out", {
    input_game_id: gameB.game_id,
    input_player_id: otherPlayer.player_id,
    input_amount: 13,
    input_operation_key: failedCashOutOperationKey,
  });
  assert(!recoveredCashOut.error && Number(recoveredCashOut.data?.amount) === 13,
    "the same operation key can safely retry after the rolled-back activity failure");
  const hostSettlementCashOut = await otherHost.rpc("save_cash_out", {
    input_game_id: gameB.game_id,
    input_player_id: gameB.player_id,
    input_amount: 19,
    input_operation_key: randomUUID(),
  });
  assert(!hostSettlementCashOut.error && Number(hostSettlementCashOut.data?.amount) === 19,
    "host can enter the remaining final stack before settlement lock");
  const otherGameEnded = await otherHost
    .from("games")
    .update({ status: "ended" })
    .eq("id", gameB.game_id)
    .eq("status", "settling")
    .select("id");
  assert(!otherGameEnded.error && otherGameEnded.data?.length === 1,
    "the complete cash-out fixture locks its settlement");
  const endedPhaseSave = await otherHost.rpc("save_cash_out", {
    input_game_id: gameB.game_id,
    input_player_id: otherPlayer.player_id,
    input_amount: 14,
    input_operation_key: randomUUID(),
  });
  assert(endedPhaseSave.error, "a new final stack is rejected after settlement locks");
  const endedPhaseRetry = await otherHost.rpc("save_cash_out", {
    input_game_id: gameB.game_id,
    input_player_id: otherPlayer.player_id,
    input_amount: 13,
    input_operation_key: failedCashOutOperationKey,
  });
  assert(!endedPhaseRetry.error && Number(endedPhaseRetry.data?.amount) === 13,
    "a committed cash-out retry still returns its receipt after settlement locks");
  const { data: otherGameCashOut, error: otherGameCashOutError } = await admin
    .from("cash_outs")
    .select("id")
    .eq("game_id", gameB.game_id)
    .eq("player_id", otherPlayer.player_id)
    .single();
  assert(!otherGameCashOutError && otherGameCashOut?.id, "other game cash-out fixture is created");

  const operationKey = randomUUID();
  const first = await guestA.rpc("create_buy_in_idempotent", {
    input_game_id: gameA.game_id,
    input_player_id: playerA.player_id,
    input_amount: 15,
    input_type: "rebuy",
    input_fronted_by_player_id: null,
    input_operation_key: operationKey,
  });
  assert(!first.error && first.data?.length === 1 && first.data[0].created === true, "first idempotent rebuy is created");
  const second = await guestA.rpc("create_buy_in_idempotent", {
    input_game_id: gameA.game_id,
    input_player_id: playerA.player_id,
    input_amount: 15,
    input_type: "rebuy",
    input_fronted_by_player_id: null,
    input_operation_key: operationKey,
  });
  assert(!second.error && second.data?.length === 1 && second.data[0].created === false, "retry returns the original buy-in");
  assert(second.data[0].id === first.data[0].id, "retry returns the same buy-in id");
  const mismatch = await guestA.rpc("create_buy_in_idempotent", {
    input_game_id: gameA.game_id,
    input_player_id: playerA.player_id,
    input_amount: 16,
    input_type: "rebuy",
    input_fronted_by_player_id: null,
    input_operation_key: operationKey,
  });
  assert(mismatch.error, "operation key reused with different inputs is rejected");
  console.log("✓ idempotent buy-in create/retry/mismatch");
  const guestBuyIn = first.data[0];
  assert(guestBuyIn.verified === false, "player-created buy-in waits for host approval");

  const hostRebuy = await host.rpc("create_buy_in_idempotent", {
    input_game_id: gameA.game_id,
    input_player_id: gameA.player_id,
    input_amount: 20,
    input_type: "rebuy",
    input_fronted_by_player_id: null,
    input_operation_key: randomUUID(),
  });
  assert(
    !hostRebuy.error
      && hostRebuy.data?.length === 1
      && hostRebuy.data[0].verified === true,
    "host-created rebuy is automatically approved",
  );
  console.log("✓ host entries auto-approve while player entries stay pending");

  const rebuyOperationKey = randomUUID();
  const rebuy = await guestA.rpc("create_buy_in_idempotent", {
    input_game_id: gameA.game_id,
    input_player_id: playerA.player_id,
    input_amount: 15,
    input_type: "rebuy",
    input_fronted_by_player_id: playerB.player_id,
    input_operation_key: rebuyOperationKey,
  });
  assert(!rebuy.error && rebuy.data?.length === 1 && rebuy.data[0].created === true, "outstanding rebuy advance is created");
  assert(rebuy.data[0].type === "rebuy", "rebuy keeps its ledger type");
  assert(rebuy.data[0].fronted_by_player_id === playerB.player_id, "rebuy keeps its funding player");
  const retriedRebuy = await guestA.rpc("create_buy_in_idempotent", {
    input_game_id: gameA.game_id,
    input_player_id: playerA.player_id,
    input_amount: 15,
    input_type: "rebuy",
    input_fronted_by_player_id: playerB.player_id,
    input_operation_key: rebuyOperationKey,
  });
  assert(!retriedRebuy.error && retriedRebuy.data?.[0]?.created === false, "rebuy retry returns its original ledger entry");
  assert(retriedRebuy.data[0].id === rebuy.data[0].id, "rebuy retry does not duplicate the ledger entry");
  console.log("✓ idempotent outstanding rebuy advance create/retry");

  await expectError(
    () => guestA.rpc("create_buy_in_idempotent", {
      input_game_id: gameA.game_id,
      input_player_id: playerA.player_id,
      input_amount: 5,
      input_type: "rebuy",
      input_fronted_by_player_id: playerA.player_id,
      input_operation_key: randomUUID(),
    }),
    "self-funded entry recorded as an advance",
  );
  await expectError(
    () => guestA.rpc("create_buy_in_idempotent", {
      input_game_id: gameA.game_id,
      input_player_id: playerA.player_id,
      input_amount: 5,
      input_type: "buy_in",
      input_fronted_by_player_id: otherPlayer.player_id,
      input_operation_key: randomUUID(),
    }),
    "advance payer from another game",
  );
  console.log("✓ advances reject self-funding and cross-game payers");

  await expectError(
    () => guestA.from("buy_ins").insert({ game_id: gameB.game_id, player_id: otherPlayer.player_id, amount: 12, type: "buy_in" }),
    "cross-game buy-in insert",
  );
  // Do not select/return from this write: PostgREST can otherwise hide a
  // successful RLS mutation behind an empty result. Verify both the explicit
  // rejection and the canonical absence independently as the service role.
  const crossGameCashOutInsert = await guestA.from("cash_outs").insert({
    game_id: gameB.game_id,
    player_id: playerA.player_id,
    amount: 12,
  });
  assert(crossGameCashOutInsert.error, "cross-game cash-out insert without RETURNING is rejected");
  const { data: crossGameCashOutRows, error: crossGameCashOutReadError } = await admin
    .from("cash_outs")
    .select("id")
    .eq("game_id", gameB.game_id)
    .eq("player_id", playerA.player_id);
  assert(!crossGameCashOutReadError && crossGameCashOutRows?.length === 0,
    "cross-game cash-out insert creates no canonical row");
  await expectError(
    () => guestA.from("buy_ins").update({ amount: 99 }).eq("id", otherGameBuyInId).select("id"),
    "cross-game buy-in update",
  );
  await expectError(
    () => guestA.from("cash_outs").update({ amount: 99 }).eq("id", otherGameCashOut.id).select("id"),
    "cross-game cash-out update",
  );
  const hidden = await guestA.from("buy_ins").select("id").eq("game_id", gameB.game_id);
  assert(!hidden.error && hidden.data?.length === 0, "cross-game buy-ins are not readable");
  console.log("✓ cross-game reads and writes are denied");

  const protectedTables = ["players", "buy_ins", "cash_outs", "early_cash_outs", "game_events", "settlement_payments"];
  for (const table of protectedTables) {
    const { data, error } = await outsider.from(table).select("id").eq("game_id", gameA.game_id);
    assert(!error && data?.length === 0, `outsider cannot read Game A ${table}`);
  }
  const hiddenGame = await outsider.from("games").select("id").eq("id", gameA.game_id);
  assert(!hiddenGame.error && hiddenGame.data?.length === 0, "outsider cannot read Game A");

  const { data: { user: guestAUser } } = await guestA.auth.getUser();
  assert(guestAUser, "guest A remains authenticated for push-subscription checks");
  const pushEndpoint = `https://push.example.test/${randomUUID()}`;
  const ownPushSubscription = await guestA.from("push_subscriptions").insert({
    user_id: guestAUser.id,
    endpoint: pushEndpoint,
    p256dh: "test-p256dh-key",
    auth: "test-auth-key",
  }).select("id");
  assert(!ownPushSubscription.error && ownPushSubscription.data?.[0]?.id, "player can create their own push subscription");
  const hiddenPushSubscription = await guestB.from("push_subscriptions").select("id").eq("endpoint", pushEndpoint);
  assert(!hiddenPushSubscription.error && hiddenPushSubscription.data?.length === 0, "other players cannot read a device push subscription");
  await expectError(
    () => guestB.from("push_subscriptions").delete().eq("endpoint", pushEndpoint).select("id"),
    "other player push-subscription deletion",
  );
  await expectError(
    () => guestA.from("push_dispatches").insert({ game_id: gameA.game_id, event_type: "game_settling", dedupe_key: "client-attempt" }).select("id"),
    "client push dispatch claim",
  );
  const productOpsRead = await guestA.from("product_ops_outbox").select("sequence");
  assert(productOpsRead.error || productOpsRead.data?.length === 0, "client cannot read Product Ops outbox");
  const productOpsServerRead = await admin.from("product_ops_outbox").select("sequence").limit(1);
  assert(!productOpsServerRead.error, "server role can read Product Ops outbox for the collector pull route");
  await expectError(
    () => guestA.from("product_ops_outbox").insert({
      environment: "development",
      event_name: "game.created",
      occurred_at: new Date().toISOString(),
      actor_id: "anon_client_attempt",
      session_id: "sess_client_attempt",
      idempotency_key: `evt_client_attempt_${randomUUID()}`,
    }).select("sequence"),
    "client Product Ops outbox append",
  );
  const canaryRead = await guestA.from("product_ops_canary").select("probe_id");
  assert(canaryRead.error || canaryRead.data?.length === 0, "client cannot read the Product Ops canary table");
  await expectError(
    () => guestA.from("product_ops_canary").insert({ probe_id: randomUUID() }).select("probe_id"),
    "client Product Ops canary append",
  );
  console.log("✓ push subscriptions stay private and delivery claims stay server-only");

  await expectError(
    () => outsider.from("players").update({ name: "Intruder" }).eq("id", playerA.player_id).select("id"),
    "outsider player update",
  );
  await expectError(
    () => outsider.from("buy_ins").update({ amount: 99 }).eq("id", guestBuyIn.id).select("id"),
    "outsider buy-in update",
  );
  await expectError(
    () => outsider.from("cash_outs").update({ amount: 99 }).eq("id", otherGameCashOut.id).select("id"),
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
  await expectError(
    () => guestA.from("buy_ins").insert({
      game_id: gameA.game_id,
      player_id: playerA.player_id,
      amount: 99,
      type: "buy_in",
      verified: true,
    }).select("id"),
    "player-created pre-approved buy-in",
  );
  await expectError(
    () => guestA.from("buy_ins").update({ verified: true }).eq("id", guestBuyIn.id).select("id"),
    "player verification of their own buy-in",
  );
  await expectError(
    () => guestA.from("buy_ins").update({ amount: 99 }).eq("id", guestBuyIn.id).select("id"),
    "player edit of their own buy-in",
  );
  await expectError(
    () => guestA.from("buy_ins").delete().eq("id", guestBuyIn.id).select("id"),
    "player removal of their own buy-in",
  );
  await expectError(
    () => guestA
      .from("buy_ins")
      .update({ fronted_by_player_id: null })
      .eq("id", rebuy.data[0].id)
      .select("id"),
    "player marking their own advance repaid",
  );

  const { data: unchangedGuestBuyIn, error: unchangedGuestBuyInError } = await admin
    .from("buy_ins")
    .select("amount, verified")
    .eq("id", guestBuyIn.id)
    .single();
  assert(
    !unchangedGuestBuyInError
      && Number(unchangedGuestBuyIn.amount) === 15
      && unchangedGuestBuyIn.verified === false,
    "rejected player mutations leave the buy-in unchanged",
  );

  await expectError(
    () => host.from("buy_ins").update({ amount: 17 }).eq("id", guestBuyIn.id).select("id"),
    "unaudited host buy-in amount update",
  );
  const correctionKey = randomUUID();
  await expectError(
    () => guestA.rpc("correct_buy_in_as_host", {
      input_buy_in_id: guestBuyIn.id,
      input_amount: 17,
      input_operation_key: correctionKey,
    }),
    "player replaying a host correction key",
  );
  const hostCorrection = await host.rpc("correct_buy_in_as_host", {
    input_buy_in_id: guestBuyIn.id,
    input_amount: 17,
    input_operation_key: correctionKey,
  });
  const correctionRow = (Array.isArray(hostCorrection.data) ? hostCorrection.data[0] : hostCorrection.data) as {
    id?: string; amount?: number | string; verified?: boolean;
  } | null;
  assert(
    !hostCorrection.error
      && correctionRow?.id === guestBuyIn.id
      && Number(correctionRow?.amount) === 17
      && correctionRow?.verified === true,
    "host correction atomically edits and verifies a player buy-in",
  );
  const correctionRetry = await host.rpc("correct_buy_in_as_host", {
    input_buy_in_id: guestBuyIn.id,
    input_amount: 17,
    input_operation_key: correctionKey,
  });
  const correctionEvents = await host
    .from("game_events")
    .select("id, metadata")
    .eq("game_id", gameA.game_id)
    .eq("subject_player_id", playerA.player_id)
    .eq("event_type", "buy_in_updated");
  assert(
    !correctionRetry.error && correctionEvents.data?.length === 1
      && correctionEvents.data[0].metadata?.verified_by_correction === true,
    "host correction retries return the same result without a second audit event",
  );

  const hostRepaidAdvance = await host
    .from("buy_ins")
    .update({ fronted_by_player_id: null })
    .eq("id", rebuy.data[0].id)
    .select("id, fronted_by_player_id");
  assert(
    !hostRepaidAdvance.error
      && hostRepaidAdvance.data?.[0]?.id === rebuy.data[0].id
      && hostRepaidAdvance.data[0].fronted_by_player_id === null,
    "host can mark an outstanding advance repaid",
  );

  const removableBuyIn = await guestB.rpc("create_buy_in_idempotent", {
    input_game_id: gameA.game_id,
    input_player_id: playerB.player_id,
    input_amount: 10,
    input_type: "rebuy",
    input_fronted_by_player_id: null,
    input_operation_key: randomUUID(),
  });
  assert(
    !removableBuyIn.error && removableBuyIn.data?.[0]?.verified === false,
    "player-created removable fixture stays pending",
  );
  const hostRemoval = await host
    .from("buy_ins")
    .delete()
    .eq("id", removableBuyIn.data[0].id)
    .select("id");
  assert(
    !hostRemoval.error && hostRemoval.data?.[0]?.id === removableBuyIn.data[0].id,
    "host can remove a player buy-in",
  );
  const transfer = await guestB.rpc("transfer_game_host", { target_game_id: gameA.game_id, target_player_id: playerB.player_id });
  assert(transfer.error, "non-host host transfer");
  console.log("✓ only the host can approve, edit, or remove buy-ins");

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

  const pendingApproval = await host
    .from("buy_ins")
    .update({ verified: true })
    .eq("game_id", gameA.game_id)
    .eq("verified", false)
    .select("id");
  assert(!pendingApproval.error, "host resolves every pending entry before settlement");

  const gameASettling = await host
    .from("games")
    .update({ status: "settling", ended_at: new Date().toISOString() })
    .eq("id", gameA.game_id)
    .select("id");
  assert(!gameASettling.error && gameASettling.data?.[0]?.id, "host can enter settlement");

  const cashOutFixture = await Promise.all([
    [gameA.player_id, 50],
    [playerA.player_id, 40],
    [playerB.player_id, 20],
  ].map(([playerId, amount]) => host.rpc("save_cash_out", {
    input_game_id: gameA.game_id,
    input_player_id: playerId,
    input_amount: amount,
    input_operation_key: randomUUID(),
  })));
  assert(cashOutFixture.every((result) => !result.error && result.data?.id),
    "every player has a current cash-out before settlement lock");

  const allocation = {
    method: "proportional",
    player_ids: [playerA.player_id, playerB.player_id],
    amount: 2,
  };
  const hostAllocation = await host
    .from("games")
    .update({ discrepancy_allocation: allocation })
    .eq("id", gameA.game_id)
    .eq("status", "settling")
    .select("id, discrepancy_allocation");
  assert(
    !hostAllocation.error
      && hostAllocation.data?.[0]?.id
      && hostAllocation.data[0].discrepancy_allocation?.amount === allocation.amount,
    "host can save a discrepancy allocation during settlement",
  );
  await expectError(
    () => guestA
      .from("games")
      .update({ discrepancy_allocation: { ...allocation, amount: 6 } })
      .eq("id", gameA.game_id)
      .select("id"),
    "non-host discrepancy allocation update",
  );
  console.log("✓ discrepancy allocations persist for the host and reject non-host writes");

  const draftPayment = {
    game_id: gameA.game_id,
    from_player_id: playerA.player_id,
    to_player_id: playerB.player_id,
    amount: 2.34,
    mode: "min",
  };
  await expectError(
    () => guestA.from("settlement_payments").insert(draftPayment).select("id"),
    "settlement payment insert before game lock",
  );

  const adminDraft = await admin
    .from("settlement_payments")
    .insert({ ...draftPayment, amount: 1.23 })
    .select("id")
    .single();
  assert(!adminDraft.error && adminDraft.data?.id, "service role can create a payment-state fixture");
  await expectError(
    () => guestA
      .from("settlement_payments")
      .update({ settled: true, settled_at: new Date().toISOString() })
      .eq("id", adminDraft.data.id)
      .select("id"),
    "settlement payment update before game lock",
  );
  console.log("✓ settlement payment writes reject draft settlement state");

  const gameAEnded = await host
    .from("games")
    .update({ status: "ended" })
    .eq("id", gameA.game_id)
    .eq("status", "settling")
    .select("id");
  assert(!gameAEnded.error && gameAEnded.data?.[0]?.id, "host can lock settlement");

  await expectError(
    () => guestA.from("settlement_payments").insert(draftPayment).select("id"),
    "direct payment insert cannot bypass locked-plan validation",
  );
  await expectError(
    () => guestB.from("settlement_payments").update({ settled: true })
      .eq("id", adminDraft.data.id).select("id"),
    "direct payment update cannot bypass locked-plan validation",
  );
  const [planPlayers, planBuyIns, planCashOuts] = await Promise.all([
    admin.from("players").select("id,name").eq("game_id", gameA.game_id).order("joined_at").order("id"),
    admin.from("buy_ins").select("*").eq("game_id", gameA.game_id),
    admin.from("cash_outs").select("player_id,amount").eq("game_id", gameA.game_id),
  ]);
  assert(!planPlayers.error && !planBuyIns.error && !planCashOuts.error, "locked plan fixture is readable");
  const buys = (planBuyIns.data ?? []).map(row => ({ ...row, amount: Number(row.amount) })) as BuyIn[];
  const cashOuts = planCashOuts.data ?? [];
  const rawNets = applyFundingAdjustments((planPlayers.data ?? []).map(player => ({
    playerId: player.id, name: player.name,
    net: Number(cashOuts.find(row => row.player_id === player.id)?.amount ?? 0)
      - buys.filter(row => row.player_id === player.id).reduce((sum, row) => sum + row.amount, 0),
  })), buys);
  const difference = Math.round((buys.reduce((sum, row) => sum + row.amount, 0)
    - cashOuts.reduce((sum, row) => sum + Number(row.amount), 0)) * 100) / 100;
  const expectedPayment = calculateMinTransfers(applyDiscrepancyAllocation(rawNets, difference, {
    method: "proportional", playerIds: allocation.player_ids,
  }))[0];
  assert(expectedPayment?.fromPlayerId && expectedPayment.toPlayerId, "locked fixture has a real payment to test authenticated ownership");

  const resumedPayment = { ...draftPayment, from_player_id: expectedPayment.fromPlayerId, to_player_id: expectedPayment.toPlayerId, amount: expectedPayment.amount, settled: true };
  await expectError(
    () => rotatedGuestA
      .from("settlement_payments")
      .upsert(resumedPayment, {
        onConflict: "game_id,from_player_id,to_player_id,amount,mode",
      })
      .select("id"),
    "direct payment upsert after anonymous auth rotation",
  );
  const guardedResumedPayment = await rotatedGuestA.rpc(
    "set_settlement_payment_status_guarded",
    {
      input_game_id: gameA.game_id,
      input_from_player_id: resumedPayment.from_player_id,
      input_to_player_id: resumedPayment.to_player_id,
      input_amount: resumedPayment.amount,
      input_mode: resumedPayment.mode,
      input_settled: resumedPayment.settled,
      input_session_id: playerASessionId,
    },
  );
  assert(guardedResumedPayment.error, "a replaced anonymous identity cannot use a visible session ID as payment authority");
  const originalOwnerPayment = await host.rpc("set_settlement_payment_status_guarded", {
    input_game_id: gameA.game_id,
    input_from_player_id: resumedPayment.from_player_id,
    input_to_player_id: resumedPayment.to_player_id,
    input_amount: resumedPayment.amount,
    input_mode: resumedPayment.mode,
    input_settled: true,
    input_session_id: playerASessionId,
  });
  assert(!originalOwnerPayment.error, "the authenticated host can acknowledge the real locked-plan payment");
  await expectError(
    () => outsider.rpc("set_settlement_payment_status_guarded", {
      input_game_id: gameA.game_id,
      input_from_player_id: resumedPayment.from_player_id,
      input_to_player_id: resumedPayment.to_player_id,
      input_amount: resumedPayment.amount,
      input_mode: resumedPayment.mode,
      input_settled: false,
      input_session_id: playerASessionId,
    }),
    "outsider guarded payment update with another browser session",
  );
  console.log("✓ settlement payment writes become available after game lock");
  console.log("✓ payment authority follows authenticated ownership rather than disclosed browser session IDs");
}

try {
  await verifyHostManagedPlayers();
  await verifyOptionalHostOpeningBuyIn();
  await run();
  console.log("Database assurance passed.");
} finally {
  for (const gameId of games) await admin.from("games").delete().eq("id", gameId);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}
