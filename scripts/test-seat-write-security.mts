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
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(status.API_URL ?? "")) {
    throw new Error(`Refusing to run against non-local Supabase URL: ${status.API_URL}`);
  }
  if (expectedApiUrl && status.API_URL !== expectedApiUrl) {
    throw new Error("Supabase API URL did not match the disposable test stack.");
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
  const email = `seat-write-${label}-${randomUUID()}@example.test`;
  const password = `SeatWrite-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("Could not create fixture account");
  users.push(data.user.id);

  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}

async function createGame(host: SupabaseClient, name: string) {
  const { data, error } = await host.rpc("create_game_guarded", {
    input_code: code(),
    input_game_name: name,
    input_host_name: "Casey",
    input_buy_in: 20,
    input_session_id: randomUUID(),
    input_host_is_playing: true,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as {
    code?: string; game_id?: string; player_id?: string;
  } | null;
  assert(row?.code && row.game_id && row.player_id, "guarded create returns a game and host seat");
  games.push(row.game_id);
  return row as { code: string; game_id: string; player_id: string };
}

async function join(client: SupabaseClient, gameCode: string, name: string) {
  const { data, error } = await client.rpc("join_game_guarded", {
    input_code: gameCode,
    input_player_name: name,
    input_session_id: randomUUID(),
  });
  const row = (Array.isArray(data) ? data[0] : data) as { player_id?: string } | null;
  return { error, row };
}

async function assertDeleteBlocked(client: SupabaseClient, playerId: string, label: string) {
  const { data, error } = await client.from("players").delete().eq("id", playerId).select("id");
  assert(Boolean(error) || !data || data.length === 0, `${label} cannot delete the seat`);
}

async function verifiedLedger(playerId: string) {
  const { data, error } = await admin
    .from("buy_ins")
    .select("id,player_id,amount,verified")
    .eq("player_id", playerId)
    .order("id");
  if (error) throw error;
  assert(data?.length === 1 && data[0].verified && Number(data[0].amount) === 20, "fixture has one verified buy-in");
  return data;
}

/** Demonstrates the replaced policy's cascade without changing the fixture. */
function proveLegacyGuestDeleteCascade(gameId: string, playerId: string, userId: string) {
  // The disposable full-suite stack has a stable database container name. The
  // API assertions below cover other local project names without assuming a
  // Docker container convention.
  if (status.API_URL !== "http://127.0.0.1:55321") return;
  const sql = `
begin;
drop policy if exists "players host deletes non-host seats" on public.players;
create policy "players self or host delete" on public.players
  for delete to authenticated
  using (public.game_has_status(game_id, 'active') and (auth.uid() = user_id or public.is_game_host(game_id)));
select pg_catalog.set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true);
set local role authenticated;
delete from public.players where id = '${playerId}' returning id;
reset role;
select case when not exists (select 1 from public.players where id = '${playerId}')
  and not exists (select 1 from public.buy_ins where player_id = '${playerId}')
  and exists (select 1 from public.games where id = '${gameId}')
  then 'legacy-self-delete-cascades-ledger' else 'legacy-probe-failed' end;
rollback;
`;
  const output = execFileSync("docker", [
    "exec", "-i", "supabase_db_mainpot-e2e", "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-At",
  ], { input: sql, encoding: "utf8" });
  assert(
    output.includes(playerId) && output.includes("legacy-self-delete-cascades-ledger"),
    "the replaced self-or-host policy lets a guest cascade their verified ledger",
  );
}

async function run() {
  const host = await account("host");
  const guest = await account("guest");
  const outsider = await account("outsider");
  const game = await createGame(host.client, "Seat write security");

  const joined = await join(guest.client, game.code, "Jordan");
  assert(!joined.error && joined.row?.player_id, "guarded join remains available");
  const guestPlayerId = joined.row.player_id;
  const approval = await host.client.from("buy_ins")
    .update({ verified: true }).eq("player_id", guestPlayerId).select("id,verified").single();
  assert(!approval.error && approval.data?.verified, "host can verify the guarded opening buy-in");

  const added = await host.client.rpc("add_host_player", {
    input_game_id: game.game_id,
    input_name: "Host removable",
    input_buy_in: 0,
    input_operation_key: randomUUID(),
  });
  const managedPlayerId = (added.data as { id?: string } | null)?.id;
  assert(!added.error && managedPlayerId, "guarded host-managed add remains available");

  const fakeHost = await guest.client.from("players").insert({
    game_id: game.game_id,
    session_id: randomUUID(),
    name: "Raw fake host",
    user_id: guest.id,
    is_host: true,
  }).select("id");
  assert(fakeHost.error, "raw insert cannot create a host seat");

  const ledgerBefore = await verifiedLedger(guestPlayerId);
  proveLegacyGuestDeleteCascade(game.game_id, guestPlayerId, guest.id);
  assert(JSON.stringify(await verifiedLedger(guestPlayerId)) === JSON.stringify(ledgerBefore), "rolled-back legacy-policy probe leaves the verified ledger intact");
  await assertDeleteBlocked(guest.client, guestPlayerId, "guest");
  assert(JSON.stringify(await verifiedLedger(guestPlayerId)) === JSON.stringify(ledgerBefore), "guest deletion attempt preserves verified ledger");
  await assertDeleteBlocked(outsider.client, guestPlayerId, "outsider");
  assert(JSON.stringify(await verifiedLedger(guestPlayerId)) === JSON.stringify(ledgerBefore), "outsider deletion attempt preserves verified ledger");

  const hostDelete = await host.client.from("players").delete().eq("id", managedPlayerId).select("id");
  assert(!hostDelete.error && hostDelete.data?.[0]?.id === managedPlayerId, "active host can remove a non-host seat");
  const managedAfterDelete = await admin.from("players").select("id").eq("id", managedPlayerId).maybeSingle();
  assert(!managedAfterDelete.error && !managedAfterDelete.data, "host removal deletes the selected non-host seat");

  await assertDeleteBlocked(host.client, game.player_id, "host");
  const hostAfterDeleteAttempt = await admin.from("players").select("id").eq("id", game.player_id).maybeSingle();
  assert(!hostAfterDeleteAttempt.error && hostAfterDeleteAttempt.data?.id === game.player_id, "host self-delete is denied");

  const { data: config, error: configError } = await admin
    .from("app_config").select("max_players_per_game").eq("id", true).single();
  if (configError) throw configError;
  const maximumSeats = Number(config.max_players_per_game);
  assert(Number.isInteger(maximumSeats) && maximumSeats >= 2, "fixture has a sensible player limit");
  let activeCount = 2; // Host and Jordan; the managed seat was deleted above.
  while (activeCount < maximumSeats) {
    const filler = await account(`filler-${activeCount}`);
    const fillerJoin = await join(filler.client, game.code, `Filler ${activeCount}`);
    assert(!fillerJoin.error && fillerJoin.row?.player_id, "guarded join fills the active table");
    activeCount += 1;
  }

  const excess = await account("excess");
  const rawExcess = await excess.client.from("players").insert({
    game_id: game.game_id,
    session_id: randomUUID(),
    name: "Raw excess seat",
    user_id: excess.id,
    is_host: false,
  }).select("id");
  assert(rawExcess.error, "raw insert cannot bypass a full-table capacity limit");
  const activeSeats = await admin.from("players").select("id").eq("game_id", game.game_id).is("left_at", null);
  assert(!activeSeats.error && activeSeats.data?.length === maximumSeats, "failed raw excess insert leaves the table at its configured limit");

  const closedHost = await account("closed-host");
  const closedGame = await createGame(closedHost.client, "Closed seat write security");
  const close = await closedHost.client.from("games").update({ status: "settling" }).eq("id", closedGame.game_id).select("id").single();
  assert(!close.error && close.data?.id === closedGame.game_id, "fixture game enters settlement");
  const rawClosed = await outsider.client.from("players").insert({
    game_id: closedGame.game_id,
    session_id: randomUUID(),
    name: "Raw closed seat",
    user_id: outsider.id,
    is_host: false,
  }).select("id");
  assert(rawClosed.error, "raw insert cannot bypass the closed-game phase");

  console.log("✓ guarded seat creation remains available while raw inserts and destructive self-deletes are denied");
}

run().finally(async () => {
  for (const gameId of games) await admin.from("games").delete().eq("id", gameId);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
