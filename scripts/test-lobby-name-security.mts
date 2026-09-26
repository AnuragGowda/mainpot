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
    throw new Error(`Supabase API URL did not match the disposable test stack: ${status.API_URL}`);
  }
  return status;
}

function localQuery(sql: string) {
  execFileSync(supabaseCommand, [
    ...(workdir ? ["--workdir", workdir] : []), "db", "query", "--local", sql,
  ], { encoding: "utf8", stdio: "pipe" });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function lobbyNameKey(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
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
  const email = `name-guard-${label}-${randomUUID()}@example.test`;
  const password = `NameGuard-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("Could not create fixture account");
  users.push(data.user.id);
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}

async function createGame(host: SupabaseClient, hostName: string) {
  const { data, error } = await host.rpc("create_game_guarded", {
    input_code: code(),
    input_game_name: `Name guards ${randomUUID().slice(0, 8)}`,
    input_host_name: hostName,
    input_buy_in: 20,
    input_session_id: randomUUID(),
    input_host_is_playing: true,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as {
    code?: string; game_id?: string; player_id?: string;
  } | null;
  assert(row?.code && row.game_id && row.player_id, "guarded game creation returns a game and host seat");
  games.push(row.game_id);
  return row as { code: string; game_id: string; player_id: string };
}

async function join(client: SupabaseClient, gameCode: string, name: string, sessionId = randomUUID()) {
  return client.rpc("join_game_guarded", {
    input_code: gameCode,
    input_player_name: name,
    input_session_id: sessionId,
  });
}

async function run() {
  const host = await account("host");
  const jordan = await account("jordan");
  const updateAttempt = await account("update");
  const collision = await account("collision");
  const unicode = await account("unicode");
  const departed = await account("departed");
  const thief = await account("thief");
  const firstGame = await createGame(host.client, "Host Guard");

  const jordanSession = randomUUID();
  const jordanJoin = await join(jordan.client, firstGame.code, "Jordan", jordanSession);
  const jordanRow = (Array.isArray(jordanJoin.data) ? jordanJoin.data[0] : jordanJoin.data) as { player_id?: string } | null;
  assert(!jordanJoin.error && jordanRow?.player_id, "first seat joins");

  const hostCollision = await host.client.rpc("add_host_player", {
    input_game_id: firstGame.game_id,
    input_name: "  host   guard ",
    input_buy_in: 0,
    input_operation_key: randomUUID(),
  });
  assert(hostCollision.error, "host-managed seats cannot collide with the host name");

  const directInsert = await collision.client.from("players").insert({
    game_id: firstGame.game_id,
    session_id: randomUUID(),
    name: "  jOrDaN  ",
    user_id: collision.id,
    is_host: false,
  }).select("id");
  assert(directInsert.error, "direct table insert cannot bypass case/space name uniqueness");

  const updateJoin = await join(updateAttempt.client, firstGame.code, "Update candidate");
  const updateRow = (Array.isArray(updateJoin.data) ? updateJoin.data[0] : updateJoin.data) as { player_id?: string } | null;
  assert(!updateJoin.error && updateRow?.player_id, "update fixture joins");
  const directUpdate = await updateAttempt.client.from("players")
    .update({ name: "JORDAN" }).eq("id", updateRow.player_id).select("id");
  assert(directUpdate.error, "direct table update cannot create a duplicate name");

  const fullWidthJordan = await unicode.client.rpc("join_game_guarded", {
    input_code: firstGame.code,
    input_player_name: "Ｊｏｒｄａｎ",
    input_session_id: randomUUID(),
  });
  assert(fullWidthJordan.error, "NFKC full-width names collide with ASCII names");

  const invisibleJordan = await join(collision.client, firstGame.code, "Jor\u200bdan\ufe0f");
  assert(invisibleJordan.error, "invisible formatting cannot disguise an existing lobby name");

  const invisibleOnly = await join(collision.client, firstGame.code, "\u200b\ufe0f");
  assert(invisibleOnly.error, "an invisible-only name cannot create a seat");

  const accented = await join(unicode.client, firstGame.code, "José");
  const accentedRow = (Array.isArray(accented.data) ? accented.data[0] : accented.data) as { player_id?: string } | null;
  assert(!accented.error && accentedRow?.player_id, "composed Unicode name joins");
  const decomposed = await collision.client.rpc("join_game_guarded", {
    input_code: firstGame.code,
    input_player_name: "Jose\u0301",
    input_session_id: randomUUID(),
  });
  assert(decomposed.error, "NFKC composed and decomposed accents collide");

  const departedJoin = await join(departed.client, firstGame.code, "Departed Seat");
  const departedRow = (Array.isArray(departedJoin.data) ? departedJoin.data[0] : departedJoin.data) as { player_id?: string } | null;
  assert(!departedJoin.error && departedRow?.player_id, "departed fixture joins");
  const departure = await departed.client.from("players")
    .update({ left_at: new Date().toISOString() }).eq("id", departedRow.player_id).select("id");
  assert(!departure.error, "player can depart without releasing the name");
  const departedCollision = await collision.client.rpc("join_game_guarded", {
    input_code: firstGame.code,
    input_player_name: " departed    seat ",
    input_session_id: randomUUID(),
  });
  assert(departedCollision.error, "departed seats continue to reserve their lobby name");

  const managed = await host.client.rpc("add_host_player", {
    input_game_id: firstGame.game_id,
    input_name: "Table Runner",
    input_buy_in: 0,
    input_operation_key: randomUUID(),
  });
  assert(!managed.error && managed.data?.id, "host can add a managed seat");
  const managedCollision = await thief.client.rpc("join_game_guarded", {
    input_code: firstGame.code,
    input_player_name: " table   runner ",
    input_session_id: randomUUID(),
  });
  assert(managedCollision.error, "host-managed seats reserve their name");

  const ownResume = await join(jordan.client, firstGame.code, "Different supplied name", randomUUID());
  const ownResumeRow = (Array.isArray(ownResume.data) ? ownResume.data[0] : ownResume.data) as { player_id?: string } | null;
  assert(!ownResume.error && ownResumeRow?.player_id === jordanRow.player_id, "an account resumes only its existing seat");
  const copiedSession = await join(thief.client, firstGame.code, "Jordan", jordanSession);
  assert(copiedSession.error, "a copied session cannot claim another account's seat");
  const ownerAfterCopy = await admin.from("players").select("user_id").eq("id", jordanRow.player_id).single();
  assert(ownerAfterCopy.data?.user_id === jordan.id, "copied-session attempt leaves the foreign seat owned by its account");

  const directA = await account("direct-a");
  const directB = await account("direct-b");
  const directGame = firstGame;
  // Authenticated inserts are denied entirely. Trusted maintenance still
  // exercises the trigger so constraints protect every write path.
  const directRows = await Promise.all([
    admin.from("players").insert({
      game_id: directGame.game_id, session_id: randomUUID(), name: "Concurrent Direct", user_id: directA.id, is_host: false,
    }).select("id"),
    admin.from("players").insert({
      game_id: directGame.game_id, session_id: randomUUID(), name: " concurrent   direct ", user_id: directB.id, is_host: false,
    }).select("id"),
  ]);
  assert(directRows.filter((result) => !result.error).length === 1, "concurrent trusted direct inserts admit exactly one normalized name");

  const mixedGuest = await account("mixed-guest");
  const mixedGame = firstGame;
  const mixedRows = await Promise.all([
    host.client.rpc("add_host_player", {
      input_game_id: mixedGame.game_id, input_name: "Concurrent Mixed", input_buy_in: 0, input_operation_key: randomUUID(),
    }),
    join(mixedGuest.client, mixedGame.code, " concurrent   mixed "),
  ]);
  assert(mixedRows.filter((result) => !result.error).length === 1, "concurrent join and host-managed add admit exactly one normalized name");
  const mixedPlayers = await admin.from("players").select("name").eq("game_id", mixedGame.game_id);
  assert(
    !mixedPlayers.error && (mixedPlayers.data ?? []).filter((player) => lobbyNameKey(player.name) === "concurrent mixed").length === 1,
    "mixed concurrent paths leave exactly one matching seat",
  );

  const legacyA = await account("legacy-a");
  const legacyB = await account("legacy-b");
  const legacyNew = await account("legacy-new");
  const legacyGame = firstGame;
  const legacyASeat = randomUUID();
  const legacyBSeat = randomUUID();
  let legacyTriggerDisabled = false;
  try {
    localQuery("alter table public.players disable trigger guard_player_lobby_name");
    legacyTriggerDisabled = true;
    localQuery(`insert into public.players (id, game_id, session_id, name, is_host, user_id) values ('${legacyASeat}', '${legacyGame.game_id}', '${randomUUID()}', 'Legacy Seat', false, '${legacyA.id}'), ('${legacyBSeat}', '${legacyGame.game_id}', '${randomUUID()}', ' legacy   seat ', false, '${legacyB.id}')`);
    localQuery(`insert into mainpot_private.player_lobby_name_reservations (game_id, normalized_name, player_id) select distinct on (player.game_id, mainpot_private.player_lobby_name_key(player.name)) player.game_id, mainpot_private.player_lobby_name_key(player.name), player.id from public.players as player where player.game_id = '${legacyGame.game_id}' order by player.game_id, mainpot_private.player_lobby_name_key(player.name), player.joined_at, player.id on conflict (game_id, normalized_name) do nothing`);
  } finally {
    if (legacyTriggerDisabled) localQuery("alter table public.players enable trigger guard_player_lobby_name");
  }

  const unchangedLegacy = await legacyA.client.from("players")
    .update({ left_at: new Date().toISOString() }).eq("id", legacyASeat).select("id");
  assert(!unchangedLegacy.error && unchangedLegacy.data?.length === 1, "an unchanged legacy duplicate remains editable for unrelated writes");
  const legacyCollision = await join(legacyNew.client, legacyGame.code, " LEGACY   SEAT ");
  assert(legacyCollision.error, "a legacy duplicate blocks a new normalized duplicate");
  const legacyNames = await admin.from("players").select("id,name").in("id", [legacyASeat, legacyBSeat]);
  assert(
    !legacyNames.error
      && legacyNames.data?.some((player) => player.id === legacyASeat && player.name === "Legacy Seat")
      && legacyNames.data?.some((player) => player.id === legacyBSeat && player.name === " legacy   seat "),
    "legacy duplicate rows retain their original display names",
  );

  console.log("✓ lobby name reservations reject normalized duplicates across joins, direct writes, host-managed seats, departures, and concurrent paths without rewriting legacy rows");
}

run().finally(async () => {
  for (const gameId of games) await admin.from("games").delete().eq("id", gameId);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
