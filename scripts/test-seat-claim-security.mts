import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
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

function token(): string {
  return randomBytes(32).toString("base64url");
}

function tokenHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function gameCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function anonymous(): Promise<{ id: string; client: SupabaseClient }> {
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("Could not create anonymous test user");
  users.push(data.user.id);
  return { id: data.user.id, client };
}

function expireClaim(hash: string) {
  execFileSync(supabaseCommand, [
    ...(workdir ? ["--workdir", workdir] : []),
    "db", "query", "--local",
    `update mainpot_private.host_managed_seat_claims set expires_at = now() - interval '1 minute' where token_hash = decode('${hash}', 'hex');`,
  ], { stdio: "pipe" });
}

async function addManagedSeat(host: SupabaseClient, gameId: string, name: string) {
  const result = await host.rpc("add_host_player", {
    input_game_id: gameId,
    input_name: name,
    input_buy_in: 20,
    input_operation_key: randomUUID(),
  });
  if (result.error || !result.data) throw result.error ?? new Error("Could not add managed seat");
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return row as { id: string };
}

async function mint(host: SupabaseClient, gameId: string, playerId: string, value: string) {
  const result = await host.rpc("mint_host_managed_seat_claim", {
    input_game_id: gameId,
    input_player_id: playerId,
    input_token_hash: tokenHash(value),
  });
  return result;
}

async function run() {
  const host = await anonymous();
  const claimant = await anonymous();
  const outsider = await anonymous();
  const conflicted = await anonymous();

  try {
    const created = await host.client.rpc("create_game_guarded", {
      input_code: gameCode(),
      input_game_name: "Seat claim security",
      input_host_name: "Casey",
      input_buy_in: 20,
      input_session_id: randomUUID(),
      input_host_is_playing: true,
      input_operation_key: randomUUID(),
    });
    if (created.error || !created.data) throw created.error ?? new Error("Could not create test game");
    const game = (Array.isArray(created.data) ? created.data[0] : created.data) as { game_id: string; code: string };
    games.push(game.game_id);

    const managed = await addManagedSeat(host.client, game.game_id, "Jordan");
    const opening = await admin.from("buy_ins").select("player_id,amount,verified").eq("player_id", managed.id).single();
    assert(opening.data?.player_id === managed.id && Number(opening.data.amount) === 20 && opening.data.verified,
      "managed seat begins with one verified opening entry");

    const nonHostMint = await mint(outsider.client, game.game_id, managed.id, token());
    assert(nonHostMint.error, "a non-host cannot mint a seat capability");

    const rawToken = token();
    const issued = await mint(host.client, game.game_id, managed.id, rawToken);
    assert(!issued.error && typeof issued.data === "string", "active host can mint a short-lived capability");
    const privateRead = await outsider.client.schema("mainpot_private").from("host_managed_seat_claims").select("*");
    assert(privateRead.error || privateRead.data?.length === 0, "seat capabilities are not readable through the Data API");

    const guessed = await outsider.client.rpc("claim_host_managed_seat", {
      input_game_id: game.game_id, input_token: token(), input_session_id: randomUUID(),
    });
    assert(guessed.error, "an arbitrary capability cannot claim a seat");

    const wrongExpectedGame = await claimant.client.rpc("claim_host_managed_seat", {
      input_game_id: randomUUID(), input_token: rawToken, input_session_id: randomUUID(),
    });
    assert(wrongExpectedGame.error, "a link for another game is rejected before it can bind a seat");

    const joined = await conflicted.client.rpc("join_game_guarded", {
      input_code: game.code, input_player_name: "Same claimant elsewhere", input_session_id: randomUUID(),
    });
    assert(!joined.error, "conflict fixture has an existing independent seat");
    const conflict = await conflicted.client.rpc("claim_host_managed_seat", {
      input_game_id: game.game_id, input_token: rawToken, input_session_id: randomUUID(),
    });
    assert(conflict.error, "a claimant with another seat in the game cannot claim the managed seat");

    const claimed = await claimant.client.rpc("claim_host_managed_seat", {
      input_game_id: game.game_id, input_token: rawToken, input_session_id: randomUUID(),
    });
    assert(!claimed.error && claimed.data?.player_id === managed.id, "the bearer claims the original managed seat");
    assert(claimed.data?.game_id === game.game_id,
      "the correct game can still claim the capability after a wrong-game attempt");
    const replay = await claimant.client.rpc("claim_host_managed_seat", {
      input_game_id: game.game_id, input_token: rawToken, input_session_id: randomUUID(),
    });
    assert(!replay.error && replay.data?.player_id === managed.id, "the same claimant can retry a lost response safely");
    const foreignReplay = await outsider.client.rpc("claim_host_managed_seat", {
      input_game_id: game.game_id, input_token: rawToken, input_session_id: randomUUID(),
    });
    assert(foreignReplay.error, "a claimed capability cannot be replayed by another identity");

    const [claimedPlayer, claimedOpening, access] = await Promise.all([
      admin.from("players").select("id,user_id").eq("id", managed.id).single(),
      admin.from("buy_ins").select("player_id,amount,verified").eq("player_id", managed.id).single(),
      admin.from("game_access").select("game_id,user_id").eq("game_id", game.game_id).eq("user_id", claimant.id).single(),
    ]);
    assert(claimedPlayer.data?.id === managed.id && claimedPlayer.data.user_id === claimant.id,
      "claim keeps the same player row and binds it to the claimant");
    assert(claimedOpening.data?.player_id === managed.id && Number(claimedOpening.data.amount) === 20 && claimedOpening.data.verified,
      "claim preserves the managed seat's opening entry");
    assert(access.data?.game_id === game.game_id && access.data.user_id === claimant.id,
      "claim grants the claimant room access");

    const expiredSeat = await addManagedSeat(host.client, game.game_id, "Taylor");
    const expiredToken = token();
    const expiredIssue = await mint(host.client, game.game_id, expiredSeat.id, expiredToken);
    assert(!expiredIssue.error, "host can mint a capability for expiry coverage");
    expireClaim(tokenHash(expiredToken));
    const expired = await outsider.client.rpc("claim_host_managed_seat", {
      input_game_id: game.game_id, input_token: expiredToken, input_session_id: randomUUID(),
    });
    assert(expired.error, "expired capabilities cannot claim a seat");

    const cashOutSeat = await addManagedSeat(host.client, game.game_id, "Riley");
    const cashOutToken = token();
    const cashOutIssue = await mint(host.client, game.game_id, cashOutSeat.id, cashOutToken);
    assert(!cashOutIssue.error, "host can issue a link before an early cash-out begins");
    const cashOut = await host.client.rpc("request_early_cash_out", {
      input_game_id: game.game_id,
      input_player_id: cashOutSeat.id,
      input_cash_out_amount: 0,
      input_session_id: randomUUID(),
    });
    assert(!cashOut.error, "host can create the early-cash-out rejection fixture");
    const cashOutClaim = await outsider.client.rpc("claim_host_managed_seat", {
      input_game_id: game.game_id, input_token: cashOutToken, input_session_id: randomUUID(),
    });
    assert(cashOutClaim.error, "a seat with an early cash-out cannot be claimed");
    const cashOutMint = await mint(host.client, game.game_id, cashOutSeat.id, token());
    assert(cashOutMint.error, "a seat with an early cash-out cannot receive a new claim link");

    const departedSeat = await addManagedSeat(host.client, game.game_id, "Morgan");
    const departedToken = token();
    const departedIssue = await mint(host.client, game.game_id, departedSeat.id, departedToken);
    assert(!departedIssue.error, "host can issue a link before a managed seat departs");
    const departed = await admin.from("players").update({ left_at: new Date().toISOString() }).eq("id", departedSeat.id);
    if (departed.error) throw departed.error;
    const departedClaim = await outsider.client.rpc("claim_host_managed_seat", {
      input_game_id: game.game_id, input_token: departedToken, input_session_id: randomUUID(),
    });
    assert(departedClaim.error, "a departed managed seat cannot be claimed");
    const departedMint = await mint(host.client, game.game_id, departedSeat.id, token());
    assert(departedMint.error, "a departed seat cannot receive a claim link");

    console.log("✓ host-managed seat claims are hashed, host-authorized, single-use, conflict-safe, and preserve the recorded seat");
  } finally {
    for (const gameId of games) await admin.from("games").delete().eq("id", gameId);
    for (const userId of users) await admin.auth.admin.deleteUser(userId);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
