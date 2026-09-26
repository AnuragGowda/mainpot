import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseCommand = process.platform === "win32" ? "supabase.cmd" : "supabase";
const workdir = process.env.SUPABASE_WORKDIR;
const expectedApiUrl = process.env.SUPABASE_EXPECTED_API_URL;

function localStatus() {
  const status = JSON.parse(execFileSync(supabaseCommand, [
    ...(workdir ? ["--workdir", workdir] : []), "status", "--output", "json",
  ], { encoding: "utf8" }));
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(status.API_URL ?? "")
    || (expectedApiUrl && status.API_URL !== expectedApiUrl)) {
    throw new Error("Participant-write assurance requires the intended local test stack.");
  }
  return status;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function code() {
  return Array.from(
    { length: 6 },
    () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 30)],
  ).join("");
}

const status = localStatus();
const url = status.API_URL;
const anonKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase credentials are incomplete.");

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const users: string[] = [];
const games: string[] = [];

async function account(label: string): Promise<{ id: string; client: SupabaseClient }> {
  const email = `participant-write-${label}-${randomUUID()}@example.test`;
  const password = `ParticipantWrite-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("Could not create fixture account");
  users.push(data.user.id);

  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}

async function run() {
  const host = await account("host");
  const participant = await account("participant");
  const observer = await account("observer");

  const created = await host.client.rpc("create_game_guarded", {
    input_code: code(),
    input_game_name: "Participant write security",
    input_host_name: "Host",
    input_buy_in: 20,
    input_session_id: randomUUID(),
    input_host_is_playing: true,
  });
  if (created.error) throw created.error;
  const game = (Array.isArray(created.data) ? created.data[0] : created.data) as {
    code: string; game_id: string; player_id: string;
  } | null;
  assert(game?.code && game.game_id && game.player_id, "guarded creation returns a game and host seat");
  games.push(game.game_id);

  const joined = await participant.client.rpc("join_game_guarded", {
    input_code: game.code,
    input_player_name: "Participant",
    input_session_id: randomUUID(),
  });
  const participantSeat = (Array.isArray(joined.data) ? joined.data[0] : joined.data) as { player_id: string } | null;
  assert(!joined.error && participantSeat?.player_id, "guarded join remains available");

  const approved = await host.client.from("buy_ins").update({ verified: true }).eq("game_id", game.game_id);
  if (approved.error) throw approved.error;
  const settling = await host.client.from("games").update({ status: "settling" }).eq("id", game.game_id);
  if (settling.error) throw settling.error;
  const cashOuts = await Promise.all([
    [game.player_id, 25],
    [participantSeat.player_id, 15],
  ].map(([playerId, amount]) => host.client.rpc("save_cash_out", {
    input_game_id: game.game_id,
    input_player_id: playerId,
    input_amount: amount,
    input_operation_key: randomUUID(),
  })));
  if (cashOuts.some((cashOut) => cashOut.error)) throw cashOuts.find((cashOut) => cashOut.error)?.error;
  const finalized = await host.client.from("games").update({ status: "ended" }).eq("id", game.game_id);
  if (finalized.error) throw finalized.error;

  const ownRead = await participant.client.from("game_participants")
    .select("game_id,user_id,player_id,net_result")
    .eq("game_id", game.game_id).eq("user_id", participant.id).single();
  assert(!ownRead.error && ownRead.data?.player_id === participantSeat.player_id && Number(ownRead.data.net_result) === -5,
    "trusted finalization writes the canonical participant result");

  const visibleRead = await observer.client.from("game_participants")
    .select("user_id,net_result").eq("game_id", game.game_id).eq("user_id", participant.id).single();
  assert(!visibleRead.error && visibleRead.data?.user_id === participant.id,
    "the existing authenticated participant read visibility remains unchanged");

  const forgedInsert = await participant.client.from("game_participants").insert({
    game_id: game.game_id,
    user_id: participant.id,
    player_id: participantSeat.player_id,
    net_result: 999,
  });
  assert(forgedInsert.error, "participant cannot forge a direct result row");
  const forgedUpdate = await participant.client.from("game_participants")
    .update({ net_result: 999 }).eq("game_id", game.game_id).eq("user_id", participant.id);
  assert(forgedUpdate.error, "participant cannot change an earned result");
  const forgedDelete = await participant.client.from("game_participants")
    .delete().eq("game_id", game.game_id).eq("user_id", participant.id);
  assert(forgedDelete.error, "participant cannot delete an earned result");

  const unchanged = await admin.from("game_participants")
    .select("net_result").eq("game_id", game.game_id).eq("user_id", participant.id).single();
  assert(!unchanged.error && Number(unchanged.data?.net_result) === -5,
    "denied browser writes leave the canonical result unchanged");

  const serviceWrite = await admin.from("game_participants")
    .update({ net_result: 123 }).eq("game_id", game.game_id).eq("user_id", participant.id);
  assert(!serviceWrite.error, "service role retains maintenance access to derived results");
  const restore = await admin.from("game_participants")
    .update({ net_result: -5 }).eq("game_id", game.game_id).eq("user_id", participant.id);
  if (restore.error) throw restore.error;

  const accountDeletion = await admin.auth.admin.deleteUser(participant.id);
  if (accountDeletion.error) throw accountDeletion.error;
  const cascaded = await admin.from("game_participants")
    .select("id").eq("game_id", game.game_id).eq("user_id", participant.id);
  assert(!cascaded.error && cascaded.data?.length === 0,
    "account deletion cascades its derived participant history");

  console.log("✓ derived participation results reject browser writes, retain trusted writes, and preserve account deletion");
}

run().finally(async () => {
  for (const gameId of games) await admin.from("games").delete().eq("id", gameId);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
