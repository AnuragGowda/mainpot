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

async function createGuest(label: string) {
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInAnonymously({ options: { data: { display_name: label } } });
  if (error || !data.user) throw error ?? new Error("Anonymous sign-in failed");
  clients.push(client);
  users.push(data.user.id);
  return client;
}

async function createRegisteredHost() {
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = `plan-host-${randomUUID()}@example.com`;
  const password = `Plan-${randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("Fixture account creation failed");
  users.push(created.data.user.id);
  clients.push(client);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return client;
}

async function expectRejected(operation: () => PromiseLike<{ error: unknown }>, label: string) {
  const result = await operation();
  assert(Boolean(result.error), label);
}

function code() {
  return Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 30)]).join("");
}

type Fixture = {
  gameId: string;
  code: string;
  host: SupabaseClient;
  hostPlayerId: string;
  hostSessionId: string;
  players: Record<string, { client: SupabaseClient; playerId: string; sessionId: string }>;
};

async function createFixture(
  host: SupabaseClient,
  participants: Array<{ label: string; client: SupabaseClient }>,
  label: string,
): Promise<Fixture> {
  const hostSessionId = randomUUID();
  const created = await host.rpc("create_game_guarded", {
    input_code: code(),
    input_game_name: label,
    input_host_name: "Host",
    input_buy_in: 20,
    input_session_id: hostSessionId,
  });
  const game = (Array.isArray(created.data) ? created.data[0] : created.data) as { game_id: string; player_id: string; code: string } | null;
  assert(!created.error && game?.game_id && game.player_id && game.code, `${label} creates`);
  games.push(game.game_id);

  const players: Fixture["players"] = {};
  for (const participant of participants) {
    const sessionId = randomUUID();
    const joined = await participant.client.rpc("join_game_guarded", {
      input_code: game.code,
      input_player_name: participant.label,
      input_session_id: sessionId,
    });
    const row = (Array.isArray(joined.data) ? joined.data[0] : joined.data) as { player_id: string } | null;
    assert(!joined.error && row?.player_id, `${participant.label} joins ${label}`);
    players[participant.label] = { client: participant.client, playerId: row.player_id, sessionId };
  }
  const approved = await host.from("buy_ins").update({ verified: true }).eq("game_id", game.game_id).eq("verified", false).select("id");
  assert(!approved.error && approved.data?.length === participants.length, `${label} opening entries are approved`);
  return { gameId: game.game_id, code: game.code, host, hostPlayerId: game.player_id, hostSessionId, players };
}

async function lockFixture(
  fixture: Fixture,
  cashOuts: Array<{ playerId: string; amount: number }>,
  options: { mode?: "min" | "bank"; bankPlayerId?: string | null; discrepancyAllocation?: Record<string, unknown> } = {},
) {
  const settling = await fixture.host.from("games").update({ status: "settling" }).eq("id", fixture.gameId).select("id");
  assert(!settling.error && settling.data?.length === 1, "game enters settlement");
  const savedCashOuts = await fixture.host.from("cash_outs").insert(cashOuts.map((cashOut) => ({
    game_id: fixture.gameId,
    player_id: cashOut.playerId,
    amount: cashOut.amount,
  }))).select("id");
  assert(!savedCashOuts.error && savedCashOuts.data?.length === cashOuts.length, "cash-outs are saved");
  if (options.discrepancyAllocation) {
    const saved = await fixture.host.from("games").update({ discrepancy_allocation: options.discrepancyAllocation }).eq("id", fixture.gameId).select("id");
    assert(!saved.error && saved.data?.length === 1, "discrepancy allocation is saved");
  }
  const finalized = await fixture.host.from("games").update({
    status: "ended",
    settlement_mode: options.mode ?? "min",
    settlement_bank_player_id: options.mode === "bank" ? options.bankPlayerId ?? null : null,
  }).eq("id", fixture.gameId).eq("status", "settling").select("id");
  assert(!finalized.error && finalized.data?.length === 1, "game locks its settlement plan");
}

async function setFinalPayment(
  client: SupabaseClient,
  fixture: Fixture,
  fromPlayerId: string,
  toPlayerId: string,
  amount: number,
  mode: "min" | "bank",
  sessionId: string,
) {
  return client.rpc("set_settlement_payment_status_guarded", {
    input_game_id: fixture.gameId,
    input_from_player_id: fromPlayerId,
    input_to_player_id: toPlayerId,
    input_amount: amount,
    input_mode: mode,
    input_settled: true,
    input_session_id: sessionId,
  });
}

async function run() {
  const host = await createRegisteredHost();
  const guestA = await createGuest("plan guest A");
  const guestB = await createGuest("plan guest B");
  const guestC = await createGuest("plan guest C");
  const guestD = await createGuest("plan guest D");

  const min = await createFixture(host, [{ label: "A", client: guestA }, { label: "B", client: guestB }], "minimum payment plan");
  await lockFixture(min, [
    { playerId: min.hostPlayerId, amount: 40 },
    { playerId: min.players.A.playerId, amount: 0 },
    { playerId: min.players.B.playerId, amount: 20 },
  ]);
  const validMin = await setFinalPayment(guestA, min, min.players.A.playerId, min.hostPlayerId, 20, "min", min.players.A.sessionId);
  assert(!validMin.error, "an exact minimum-plan payment is accepted");
  const minObserverAccess = await guestC.rpc("get_game_by_code", { input_code: min.code });
  assert(!minObserverAccess.error, "a non-party can hold ordinary room access");
  await expectRejected(
    () => setFinalPayment(guestC, min, min.players.A.playerId, min.hostPlayerId, 20, "min", min.hostSessionId),
    "a non-party cannot use a copied host session to change a final payment",
  );
  await expectRejected(
    () => guestA.from("settlement_payments").insert({
      game_id: min.gameId,
      from_player_id: min.players.A.playerId,
      to_player_id: min.hostPlayerId,
      amount: 19,
      mode: "min",
      settled: true,
    }).select("id"),
    "direct Data API insert cannot forge a final payment",
  );
  await expectRejected(
    () => guestA.from("settlement_payments").update({ settled: false })
      .eq("game_id", min.gameId).eq("from_player_id", min.players.A.playerId).select("id"),
    "direct Data API update cannot alter a final payment",
  );
  await expectRejected(
    () => setFinalPayment(guestA, min, min.players.A.playerId, min.hostPlayerId, 19, "min", min.players.A.sessionId),
    "a made-up final payment amount is rejected",
  );
  await expectRejected(
    () => setFinalPayment(host, min, min.hostPlayerId, min.players.A.playerId, 20, "min", min.hostSessionId),
    "a reversed final payment pair is rejected",
  );
  await expectRejected(
    () => setFinalPayment(guestA, min, min.players.A.playerId, min.hostPlayerId, 20, "bank", min.players.A.sessionId),
    "a final payment cannot use an unselected mode",
  );

  const bank = await createFixture(host, [{ label: "A", client: guestA }, { label: "B", client: guestB }], "bank payment plan");
  await lockFixture(bank, [
    { playerId: bank.hostPlayerId, amount: 40 },
    { playerId: bank.players.A.playerId, amount: 0 },
    { playerId: bank.players.B.playerId, amount: 20 },
  ], { mode: "bank", bankPlayerId: bank.hostPlayerId });
  const validBank = await setFinalPayment(guestA, bank, bank.players.A.playerId, bank.hostPlayerId, 20, "bank", bank.players.A.sessionId);
  assert(!validBank.error, "an exact bank-plan payment is accepted");
  await expectRejected(
    () => setFinalPayment(guestA, bank, bank.players.A.playerId, bank.hostPlayerId, 20, "min", bank.players.A.sessionId),
    "a bank plan rejects a minimum-plan acknowledgement",
  );

  const fronted = await createFixture(host, [{ label: "A", client: guestA }, { label: "B", client: guestB }], "fronted funding plan");
  const fundedRebuy = await host.rpc("create_buy_in_idempotent", {
    input_game_id: fronted.gameId,
    input_player_id: fronted.players.A.playerId,
    input_amount: 10,
    input_type: "rebuy",
    input_fronted_by_player_id: fronted.players.B.playerId,
    input_operation_key: randomUUID(),
  });
  assert(!fundedRebuy.error, "host records a verified fronted rebuy");
  await lockFixture(fronted, [
    { playerId: fronted.hostPlayerId, amount: 30 },
    { playerId: fronted.players.A.playerId, amount: 0 },
    { playerId: fronted.players.B.playerId, amount: 40 },
  ]);
  const validFronted = await setFinalPayment(guestA, fronted, fronted.players.A.playerId, fronted.players.B.playerId, 30, "min", fronted.players.A.sessionId);
  assert(!validFronted.error, "the fronted-funding transfer from the locked plan is accepted");
  await expectRejected(
    () => setFinalPayment(guestA, fronted, fronted.players.A.playerId, fronted.hostPlayerId, 30, "min", fronted.players.A.sessionId),
    "fronted funding cannot be replaced by an arbitrary recipient",
  );

  const discrepancy = await createFixture(host, [{ label: "A", client: guestA }, { label: "B", client: guestB }], "discrepancy plan");
  await lockFixture(discrepancy, [
    { playerId: discrepancy.hostPlayerId, amount: 30 },
    { playerId: discrepancy.players.A.playerId, amount: 0 },
    { playerId: discrepancy.players.B.playerId, amount: 10 },
  ], {
    discrepancyAllocation: {
      method: "custom",
      player_ids: [discrepancy.players.A.playerId, discrepancy.players.B.playerId],
      player_allocations: [
        { player_id: discrepancy.players.A.playerId, amount: 10 },
        { player_id: discrepancy.players.B.playerId, amount: 10 },
      ],
      amount: 20,
    },
  });
  const validDiscrepancy = await setFinalPayment(guestA, discrepancy, discrepancy.players.A.playerId, discrepancy.hostPlayerId, 10, "min", discrepancy.players.A.sessionId);
  assert(!validDiscrepancy.error, "a custom discrepancy allocation produces its exact allowed payment");
  await expectRejected(
    () => setFinalPayment(guestA, discrepancy, discrepancy.players.A.playerId, discrepancy.hostPlayerId, 20, "min", discrepancy.players.A.sessionId),
    "a pre-allocation discrepancy amount is rejected",
  );

  // calculateMinTransfers sorts once. These opening nets are +$10, +$8,
  // -$6, -$5, -$7 (equivalently +1000,+800,-600,-500,-700 cents). A
  // dynamic re-sort would incorrectly allow B -> A $6 instead of B -> Host $3.
  const fixedQueue = await createFixture(host, [
    { label: "A", client: guestA },
    { label: "B", client: guestB },
    { label: "C", client: guestC },
    { label: "D", client: guestD },
  ], "fixed minimum queue");
  await lockFixture(fixedQueue, [
    { playerId: fixedQueue.hostPlayerId, amount: 30 },
    { playerId: fixedQueue.players.A.playerId, amount: 28 },
    { playerId: fixedQueue.players.B.playerId, amount: 14 },
    { playerId: fixedQueue.players.C.playerId, amount: 15 },
    { playerId: fixedQueue.players.D.playerId, amount: 13 },
  ]);
  const validFixedQueue = await setFinalPayment(
    guestB, fixedQueue, fixedQueue.players.B.playerId, fixedQueue.hostPlayerId, 3, "min", fixedQueue.players.B.sessionId,
  );
  assert(!validFixedQueue.error, "the fixed minimum-transfer queue accepts B to Host for $3");
  await expectRejected(
    () => setFinalPayment(guestB, fixedQueue, fixedQueue.players.B.playerId, fixedQueue.players.A.playerId, 6, "min", fixedQueue.players.B.sessionId),
    "a re-sorted greedy tuple is rejected",
  );

  const early = await createFixture(host, [{ label: "A", client: guestA }, { label: "B", client: guestB }], "early exit payment");
  const earlyObserverAccess = await guestC.rpc("get_game_by_code", { input_code: early.code });
  assert(!earlyObserverAccess.error, "a non-party can hold ordinary early-exit room access");
  await expectRejected(
    () => guestC.rpc("request_early_cash_out", {
      input_game_id: early.gameId,
      input_player_id: early.players.A.playerId,
      input_cash_out_amount: 30,
      input_session_id: early.players.A.sessionId,
    }),
    "a non-party cannot request an early exit with a copied player session",
  );
  const requested = await guestA.rpc("request_early_cash_out", {
    input_game_id: early.gameId,
    input_player_id: early.players.A.playerId,
    input_cash_out_amount: 30,
    input_session_id: early.players.A.sessionId,
  });
  assert(!requested.error && requested.data?.id, "early exit is requested");
  await expectRejected(
    () => guestC.rpc("cancel_early_cash_out", {
      input_early_cash_out_id: requested.data.id,
      input_session_id: early.players.A.sessionId,
    }),
    "a non-party cannot cancel an early exit with a copied player session",
  );
  const locked = await host.rpc("approve_early_cash_out", { input_early_cash_out_id: requested.data.id });
  assert(!locked.error && locked.data?.status === "locked", "early exit is locked");
  await expectRejected(
    () => guestC.rpc("set_early_cash_out_payment_status", {
      input_early_cash_out_id: requested.data.id,
      input_settled: true,
      input_session_id: early.hostSessionId,
    }),
    "a non-party cannot use a copied host session to change an early payment",
  );
  const earlyPayment = await guestA.rpc("set_early_cash_out_payment_status", {
    input_early_cash_out_id: requested.data.id,
    input_settled: true,
    input_session_id: early.players.A.sessionId,
  });
  assert(!earlyPayment.error, "the independent locked early-exit payment remains accepted");
  await lockFixture(early, [
    { playerId: early.hostPlayerId, amount: 0 },
    { playerId: early.players.B.playerId, amount: 30 },
  ]);
  const afterExitPayment = await setFinalPayment(host, early, early.hostPlayerId, early.players.B.playerId, 10, "min", early.hostSessionId);
  assert(!afterExitPayment.error, "locked early exits roll forward into the exact remaining final obligation");
  await expectRejected(
    () => setFinalPayment(host, early, early.hostPlayerId, early.players.A.playerId, 10, "min", early.hostSessionId),
    "an early-exit obligation cannot be duplicated as a final payment",
  );

  console.log("✓ final payment tracking accepts only exact locked min/bank/funded/discrepancy plans and preserves early-exit payments");
}

try {
  await run();
} finally {
  for (const gameId of games) await admin.from("games").delete().eq("id", gameId);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}
