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
  openingAmount = 20,
): Promise<Fixture> {
  const hostSessionId = randomUUID();
  const created = await host.rpc("create_game_guarded", {
    input_code: code(),
    input_game_name: label,
    input_host_name: "Host",
    input_buy_in: Math.min(openingAmount, 1_000_000),
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
  if (openingAmount > 1_000_000) {
    // Creation caps the default buy-in; guarded corrections support the full
    // numeric(10,2) ledger range used by this precision regression.
    const entries = await host.from("buy_ins").select("id").eq("game_id", game.game_id);
    assert(!entries.error && entries.data?.length === participants.length + 1, `${label} has all opening entries`);
    for (const entry of entries.data) {
      const correction = await host.rpc("correct_buy_in_as_host", {
        input_buy_in_id: entry.id, input_amount: openingAmount, input_operation_key: randomUUID(),
      });
      assert(!correction.error, `${label} sets a supported large ledger amount`);
    }
  }
  return { gameId: game.game_id, code: game.code, host, hostPlayerId: game.player_id, hostSessionId, players };
}

async function lockFixture(
  fixture: Fixture,
  cashOuts: Array<{ playerId: string; amount: number }>,
  options: { mode?: "min" | "bank"; bankPlayerId?: string | null; discrepancyAllocation?: Record<string, unknown>; decimalVersion?: boolean } = {},
) {
  const settling = await fixture.host.from("games").update({ status: "settling" }).eq("id", fixture.gameId).select("id");
  assert(!settling.error && settling.data?.length === 1, "game enters settlement");
  const savedCashOuts = await Promise.all(cashOuts.map((cashOut) => fixture.host.rpc("save_cash_out", {
    input_game_id: fixture.gameId,
    input_player_id: cashOut.playerId,
    input_amount: cashOut.amount,
    input_operation_key: randomUUID(),
  })));
  assert(savedCashOuts.length === cashOuts.length && savedCashOuts.every((cashOut) => !cashOut.error && cashOut.data), "cash-outs are saved");
  if (options.discrepancyAllocation) {
    for (const invalidVersion of [0, 3, null, "2"]) {
      await expectRejected(
        () => fixture.host.from("games").update({ discrepancy_allocation: {
          ...options.discrepancyAllocation, rounding_version: invalidVersion,
        } }).eq("id", fixture.gameId),
        "unknown or malformed rounding versions are rejected before lock",
      );
    }
    if (options.decimalVersion) {
      const { data: { session } } = await fixture.host.auth.getSession();
      assert(session, "host has an authenticated session");
      // JSON 2.0 and 2 mean the same version; PostgreSQL retains the scale.
      const saved = await fetch(`${url}/rest/v1/rpc/save_discrepancy_allocation_guarded`, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input_game_id: fixture.gameId, input_allocation: options.discrepancyAllocation }).replace('"rounding_version":2', '"rounding_version":2.0'),
      });
      assert(saved.ok, "numeric 2.0 discrepancy version is saved through the guarded RPC");
    } else {
      const saved = await fixture.host.from("games").update({ discrepancy_allocation: options.discrepancyAllocation }).eq("id", fixture.gameId).select("id");
      assert(!saved.error && saved.data?.length === 1, "discrepancy allocation is saved");
    }
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

  // Exercise the real guarded payment RPC, not just a duplicate SQL formula.
  // New cents apportionment and historical payment graphs must both survive
  // reload, and the obsolete/revised tuples must not be interchangeable.
  for (const roundingVersion of [undefined, 1, 2] as const) {
    for (const method of ["proportional", "selected"] as const) {
      for (const sign of [1, -1]) {
        const rounded = await createFixture(host, [
          { label: "A", client: guestA }, { label: "B", client: guestB },
          { label: "C", client: guestC }, { label: "D", client: guestD },
        ], `rounding ${roundingVersion ?? "legacy"} ${method} ${sign}`);
        const ids = [rounded.hostPlayerId, ...["A", "B", "C", "D"].map((name) => rounded.players[name].playerId)];
        await lockFixture(rounded, ids.map((playerId, i) => ({
          playerId, amount: i < 4 ? 20 - sign : 20 + sign * 3.98,
        })), {
          mode: "bank", bankPlayerId: ids[4],
          discrepancyAllocation: {
            method, player_ids: ids.slice(0, 4), amount: 0.02,
            ...(roundingVersion === undefined ? {} : { rounding_version: roundingVersion }),
          },
        });
        const amounts = roundingVersion === 2 ? [0.99, 0.99, 1, 1] : [0.99, 0.99, 0.99, 1.01];
        for (const [i, amount] of amounts.entries()) {
          const from = sign > 0 ? ids[i] : ids[4];
          const to = sign > 0 ? ids[4] : ids[i];
          const saved = await setFinalPayment(host, rounded, from, to, amount, "bank", rounded.hostSessionId);
          assert(!saved.error, `rounding ${roundingVersion ?? "legacy"} ${method} ${sign} accepts its exact payment ${i}`);
          if (i >= 2) await expectRejected(
            () => setFinalPayment(host, rounded, from, to, (roundingVersion === 2 ? [0.99, 1.01] : [1, 1])[i - 2], "bank", rounded.hostSessionId),
            "a different rounding version cannot rewrite the locked amount",
          );
        }
        const reread = await host.from("settlement_payments").select("amount").eq("game_id", rounded.gameId);
        assert(!reread.error && reread.data?.length === 4, "all exact cents payments survive a database read");
        await expectRejected(
          () => host.from("games").update({ discrepancy_allocation: { method, player_ids: ids.slice(0, 4), amount: 0.02, rounding_version: roundingVersion === 2 ? 1 : 2 } }).eq("id", rounded.gameId),
          "a finalized rounding version cannot be changed",
        );
      }
    }
  }

  for (const scenario of [
    { label: "unequal remainder", decimalVersion: true, opening: 20, cashOuts: [16, 17, 18, 19, 29.99], difference: 0.01, payments: [3.99, 3, 2, 1] },
    { label: "large exact numeric", decimalVersion: false, opening: 40_000_000, cashOuts: [30_000_000, 30_000_000, 30_000_000, 10_000_000, 75_000_000.01], difference: 24_999_999.99, payments: [5_833_333.33, 5_833_333.33, 5_833_333.34, 17_500_000.01] },
  ]) {
    const fixture = await createFixture(host, [
      { label: "A", client: guestA }, { label: "B", client: guestB },
      { label: "C", client: guestC }, { label: "D", client: guestD },
    ], scenario.label, scenario.opening);
    const ids = [fixture.hostPlayerId, ...["A", "B", "C", "D"].map(name => fixture.players[name].playerId)];
    await lockFixture(fixture, ids.map((playerId, i) => ({ playerId, amount: scenario.cashOuts[i] })), {
      decimalVersion: scenario.decimalVersion,
      discrepancyAllocation: { method: "proportional", player_ids: ids.slice(0, 4), amount: scenario.difference, rounding_version: 2 },
    });
    for (const [i, amount] of scenario.payments.entries()) {
      const saved = await setFinalPayment(host, fixture, ids[i], ids[4], amount, "min", fixture.hostSessionId);
      assert(!saved.error, `${scenario.label} accepts its exact minimum-plan payment ${i}`);
      await expectRejected(
        () => setFinalPayment(host, fixture, ids[i], ids[4], amount + 0.01, "min", fixture.hostSessionId),
        `${scenario.label} rejects even a one-cent drift`,
      );
    }
    const reread = await host.from("settlement_payments").select("amount").eq("game_id", fixture.gameId);
    assert(!reread.error && reread.data?.length === 4, `${scenario.label} persists all exact payments`);
  }

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
