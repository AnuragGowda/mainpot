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
  const resumedPlayerA = await join(
    rotatedGuestA,
    gameA.code,
    "Guest A",
    playerASessionId,
  );
  assert(
    resumedPlayerA.player_id === playerA.player_id,
    "a stable browser session resumes the same player after auth rotation",
  );
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
  const otherGameSettling = await otherHost
    .from("games")
    .update({ status: "settling", ended_at: new Date().toISOString() })
    .eq("id", gameB.game_id)
    .select("id");
  assert(!otherGameSettling.error && otherGameSettling.data?.[0]?.id, "other game enters settlement for its cash-out fixture");
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

  const hostCorrection = await host
    .from("buy_ins")
    .update({ amount: 17, verified: true })
    .eq("id", guestBuyIn.id)
    .select("id, amount, verified");
  assert(
    !hostCorrection.error
      && hostCorrection.data?.[0]?.id === guestBuyIn.id
      && Number(hostCorrection.data[0].amount) === 17
      && hostCorrection.data[0].verified === true,
    "host can edit and approve a player buy-in",
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

  const gameASettling = await host
    .from("games")
    .update({ status: "settling", ended_at: new Date().toISOString() })
    .eq("id", gameA.game_id)
    .select("id");
  assert(!gameASettling.error && gameASettling.data?.[0]?.id, "host can enter settlement");

  const allocation = {
    method: "proportional",
    player_ids: [playerA.player_id, playerB.player_id],
    amount: 5,
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

  const finalizedInsert = await guestA
    .from("settlement_payments")
    .insert(draftPayment)
    .select("id")
    .single();
  assert(!finalizedInsert.error && finalizedInsert.data?.id, "payment party can create payment state after game lock");
  const finalizedUpdate = await guestB
    .from("settlement_payments")
    .update({ settled: true, settled_at: new Date().toISOString() })
    .eq("id", adminDraft.data.id)
    .select("id, settled")
    .single();
  assert(!finalizedUpdate.error && finalizedUpdate.data?.settled === true, "payment party can update payment state after game lock");

  const resumedPayment = { ...draftPayment, amount: 3.45, settled: true };
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
      input_from_player_id: playerA.player_id,
      input_to_player_id: playerB.player_id,
      input_amount: resumedPayment.amount,
      input_mode: resumedPayment.mode,
      input_settled: resumedPayment.settled,
      input_session_id: playerASessionId,
    },
  );
  assert(
    !guardedResumedPayment.error,
    "the guarded payment update accepts the resumed browser session",
  );
  await expectError(
    () => outsider.rpc("set_settlement_payment_status_guarded", {
      input_game_id: gameA.game_id,
      input_from_player_id: playerA.player_id,
      input_to_player_id: playerB.player_id,
      input_amount: resumedPayment.amount,
      input_mode: resumedPayment.mode,
      input_settled: false,
      input_session_id: playerASessionId,
    }),
    "outsider guarded payment update with another browser session",
  );
  console.log("✓ settlement payment writes become available after game lock");
  console.log("✓ resumed browser sessions can update their payments after auth rotation");
}

try {
  await run();
  console.log("Database assurance passed.");
} finally {
  for (const gameId of games) await admin.from("games").delete().eq("id", gameId);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}
