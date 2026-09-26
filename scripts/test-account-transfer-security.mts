import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseCommand = process.platform === "win32" ? "supabase.cmd" : "supabase";
const workdir = process.env.SUPABASE_WORKDIR;

function localStatus() {
  const status = JSON.parse(execFileSync(supabaseCommand, [
    ...(workdir ? ["--workdir", workdir] : []), "status", "--output", "json",
  ], { encoding: "utf8" }));
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
const users: string[] = [];
const games: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function permanent(label: string): Promise<{ id: string; email: string; client: SupabaseClient }> {
  const email = `transfer-${label}-${randomUUID()}@example.test`;
  const password = `Transfer-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("Could not create permanent test user");
  users.push(data.user.id);
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, client };
}

async function anonymous(): Promise<{ id: string; client: SupabaseClient }> {
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("Could not create anonymous test user");
  users.push(data.user.id);
  return { id: data.user.id, client };
}

async function run() {
  const guest = await anonymous();
  const conflictedAccount = await permanent("conflict");
  const recoveredAccount = await permanent("recovered");
  const outsider = await permanent("outsider");
  let transferToken = "";

  try {
    const create = await guest.client.rpc("create_game_guarded", {
      input_code: "TRNSFR",
      input_game_name: "Transfer security test",
      input_host_name: "Guest host",
      input_buy_in: 20,
      input_session_id: randomUUID(),
      input_host_is_playing: true,
    });
    if (create.error) throw create.error;
    const created = (Array.isArray(create.data) ? create.data[0] : create.data) as {
      game_id: string; player_id: string; code: string;
    };
    assert(created?.game_id && created.player_id, "anonymous guarded game creation returns identifiers");
    games.push(created.game_id);

    const joined = await conflictedAccount.client.rpc("join_game_guarded", {
      input_code: created.code,
      input_player_name: "Existing account seat",
      input_session_id: randomUUID(),
    });
    assert(!joined.error, "permanent account can hold a normal game seat before a transfer conflict");

    const permanentIssue = await recoveredAccount.client.rpc("issue_anonymous_account_transfer", { input_destination_email: null });
    assert(permanentIssue.error, "permanent accounts cannot issue guest-transfer capabilities");
    const boundTokenResult = await guest.client.rpc("issue_anonymous_account_transfer", {
      input_destination_email: recoveredAccount.email,
    });
    assert(!boundTokenResult.error && typeof boundTokenResult.data === "string", "anonymous identity can prepare an email-bound guest transfer");
    const wrongEmailClaim = await outsider.client.rpc("claim_anonymous_account_transfer", { input_token: boundTokenResult.data });
    assert(wrongEmailClaim.error, "an email-bound transfer cannot be claimed by a different account");

    const tokenRow = await admin.from("account_transfer_tokens").select("created_at").eq("source_user_id", guest.id).single();
    assert(!tokenRow.error && tokenRow.data, "maintenance can inspect the expiry fixture");
    const expireToken = await admin
      .from("account_transfer_tokens")
      .update({ expires_at: new Date(Date.parse(tokenRow.data.created_at) + 1).toISOString() })
      .eq("source_user_id", guest.id);
    if (expireToken.error) throw expireToken.error;
    const expiredClaim = await recoveredAccount.client.rpc("claim_anonymous_account_transfer", { input_token: boundTokenResult.data });
    assert(expiredClaim.error, "expired transfer capabilities cannot be claimed");

    const tokenResult = await guest.client.rpc("issue_anonymous_account_transfer", { input_destination_email: null });
    assert(!tokenResult.error && typeof tokenResult.data === "string" && /^[0-9a-f]{64}$/.test(tokenResult.data), "anonymous identity issues an opaque transfer token");
    transferToken = tokenResult.data;

    const publicRead = await outsider.client.from("account_transfer_tokens").select("*");
    assert(publicRead.error || publicRead.data?.length === 0, "transfer tokens are not readable through the Data API");
    const guessedClaim = await outsider.client.rpc("claim_anonymous_account_transfer", { input_token: "0".repeat(64) });
    assert(guessedClaim.error, "an arbitrary token cannot claim guest players");

    const conflictClaim = await conflictedAccount.client.rpc("claim_anonymous_account_transfer", { input_token: transferToken });
    assert(conflictClaim.error, "an account with an existing seat cannot claim another seat in that game");
    const sourceAfterConflict = await admin.from("players").select("user_id").eq("id", created.player_id).single();
    assert(sourceAfterConflict.data?.user_id === guest.id, "a rejected conflict leaves guest ownership intact");

    const approved = await guest.client.from("buy_ins").update({ verified: true }).eq("game_id", created.game_id);
    assert(!approved.error, "guest host approves opening entries");
    const settling = await guest.client.from("games").update({ status: "settling" }).eq("id", created.game_id);
    assert(!settling.error, "guest table enters cash-outs");
    const joinedSeat = Array.isArray(joined.data) ? joined.data[0] : joined.data;
    const cashOut = await guest.client.from("cash_outs").insert([
      { game_id: created.game_id, player_id: created.player_id, amount: 25 },
      { game_id: created.game_id, player_id: joinedSeat.player_id, amount: 15 },
    ]);
    if (cashOut.error) throw cashOut.error;
    const finalized = await guest.client.from("games").update({ status: "ended" }).eq("id", created.game_id);
    if (finalized.error) throw finalized.error;

    const successClaim = await recoveredAccount.client.rpc("claim_anonymous_account_transfer", { input_token: transferToken });
    assert(!successClaim.error, "a permanent account can claim the anonymous identity with its capability");
    const replayClaim = await recoveredAccount.client.rpc("claim_anonymous_account_transfer", { input_token: transferToken });
    assert(!replayClaim.error, "the same claimant can safely retry after a lost response");
    const differentClaim = await outsider.client.rpc("claim_anonymous_account_transfer", { input_token: transferToken });
    assert(differentClaim.error, "a consumed transfer capability cannot be claimed by a different account");

    const [game, player, result] = await Promise.all([
      admin.from("games").select("host_user_id,host_is_anonymous,expires_at").eq("id", created.game_id).single(),
      admin.from("players").select("user_id").eq("id", created.player_id).single(),
      admin.from("game_participants").select("user_id,player_id,net_result").eq("game_id", created.game_id).eq("user_id", recoveredAccount.id).single(),
    ]);
    assert(game.data?.host_user_id === recoveredAccount.id && game.data.host_is_anonymous === false && game.data.expires_at === null, "hosted games become permanent and clear guest expiry");
    assert(player.data?.user_id === recoveredAccount.id, "guest player ownership transfers atomically");
    assert(result.data?.player_id === created.player_id && Number(result.data.net_result) === 5, "ended guest games gain one correct permanent participation result");
    console.log("✓ anonymous account transfer is capability-bound, conflict-safe, single-use, and preserves finalized history");
  } finally {
    for (const gameId of games) await admin.from("games").delete().eq("id", gameId);
    for (const userId of users) await admin.auth.admin.deleteUser(userId);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
