import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const cli = process.platform === "win32" ? "supabase.cmd" : "supabase";
const workdir = process.env.SUPABASE_WORKDIR;
const expected = process.env.SUPABASE_EXPECTED_API_URL;
const status = JSON.parse(execFileSync(cli, [...(workdir ? ["--workdir", workdir] : []), "status", "--output", "json"], { encoding: "utf8" }));
const url = status.API_URL, anon = status.PUBLISHABLE_KEY ?? status.ANON_KEY, service = status.SERVICE_ROLE_KEY;
if (url !== "http://127.0.0.1:55321" || expected !== url || !anon || !service) throw new Error("Lifecycle fault injection requires the disposable mainpot-e2e stack.");
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
const games: string[] = [], users: string[] = [];
const assert: (ok: unknown, message: string) => asserts ok = (ok, message) => { if (!ok) throw new Error(`Assertion failed: ${message}`); };
const sql = (command: string) => execFileSync("docker", ["exec", "-i", "supabase_db_mainpot-e2e", "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", command], { encoding: "utf8" });
const code = () => Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 30)]).join("");
async function user(label: string) {
  const email = `lifecycle-${label}-${randomUUID()}@example.test`, password = `Lifecycle-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("Could not create fixture user");
  users.push(data.user.id);
  const client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { id: data.user.id, client };
}
async function game(host: SupabaseClient, label: string) {
  const { data, error } = await host.rpc("create_game_guarded", { input_code: code(), input_game_name: label, input_host_name: "Casey", input_buy_in: 20, input_session_id: randomUUID(), input_host_is_playing: true });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { game_id: string; player_id: string; code: string };
  assert(row?.game_id && row.player_id, "guarded create returns a host seat"); games.push(row.game_id); return row;
}
async function join(client: SupabaseClient, gameCode: string, name: string) {
  const { data, error } = await client.rpc("join_game_guarded", { input_code: gameCode, input_player_name: name, input_session_id: randomUUID() });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { player_id: string }; assert(row?.player_id, "guarded join returns a seat"); return row.player_id;
}
async function eventCount(gameId: string, type: string) { const r = await admin.from("game_events").select("id").eq("game_id", gameId).eq("event_type", type); if (r.error) throw r.error; return r.data.length; }
async function rejectActivity<T>(gameId: string, work: () => PromiseLike<{ error: unknown }>, unchanged: () => Promise<void>) {
  sql(`create function public.test_reject_lifecycle_activity() returns trigger language plpgsql as $$ begin if new.game_id='${gameId}'::uuid then raise exception 'Injected lifecycle activity failure'; end if; return new; end $$; create trigger test_reject_lifecycle_activity before insert on public.game_events for each row execute function public.test_reject_lifecycle_activity();`);
  try { const r = await work(); assert(r.error, "activity failure rejects lifecycle RPC"); await unchanged(); }
  finally { sql("drop trigger if exists test_reject_lifecycle_activity on public.game_events; drop function if exists public.test_reject_lifecycle_activity();"); }
}

async function run() {
  const host = await user("host"), guest = await user("guest"), outsider = await user("outsider");
  // Start settlement: participant denied, activity failure rolls back active phase, retry writes exactly once.
  const start = await game(host.client, "Atomic start");
  assert((await guest.client.rpc("start_settlement_guarded", { input_game_id: start.game_id })).error, "participant cannot start settlement");
  await rejectActivity(start.game_id, () => host.client.rpc("start_settlement_guarded", { input_game_id: start.game_id }), async () => {
    const r = await admin.from("games").select("status").eq("id", start.game_id).single(); assert(r.data?.status === "active" && await eventCount(start.game_id, "game_settling") === 0, "failed start leaves active game without event");
  });
  assert(!(await host.client.rpc("start_settlement_guarded", { input_game_id: start.game_id })).error && await eventCount(start.game_id, "game_settling") === 1, "start retry changes phase and writes one event");

  // Allocation and finalization both retain their trigger validations and roll back their audit event.
  const settle = await game(host.client, "Atomic settlement");
  assert(!(await host.client.rpc("start_settlement_guarded", { input_game_id: settle.game_id })).error, "fixture enters settlement");
  const allocation = { method: "proportional", amount: 0, player_ids: [], player_allocations: [] };
  await rejectActivity(settle.game_id, () => host.client.rpc("save_discrepancy_allocation_guarded", { input_game_id: settle.game_id, input_allocation: allocation }), async () => {
    const r = await admin.from("games").select("discrepancy_allocation").eq("id", settle.game_id).single(); assert(r.data?.discrepancy_allocation == null && await eventCount(settle.game_id, "discrepancy_allocated") === 0, "failed allocation is absent");
  });
  assert(!(await host.client.rpc("save_discrepancy_allocation_guarded", { input_game_id: settle.game_id, input_allocation: allocation })).error && await eventCount(settle.game_id, "discrepancy_allocated") === 1, "allocation retry writes one event");
  const cash = await host.client.rpc("save_cash_out", { input_game_id: settle.game_id, input_player_id: settle.player_id, input_amount: 20, input_operation_key: randomUUID() }); if (cash.error) throw cash.error;
  await rejectActivity(settle.game_id, () => host.client.rpc("finalize_settlement_guarded", { input_game_id: settle.game_id, input_mode: "min", input_bank_player_id: null }), async () => {
    const r = await admin.from("games").select("status").eq("id", settle.game_id).single(); assert(r.data?.status === "settling" && await eventCount(settle.game_id, "game_finalized") === 0, "failed finalization leaves settlement open");
  });
  assert(!(await host.client.rpc("finalize_settlement_guarded", { input_game_id: settle.game_id, input_mode: "min", input_bank_player_id: null })).error && await eventCount(settle.game_id, "game_finalized") === 1, "finalization retry writes one event");

  // Removal locks game then seats, rejects cross-game/participant targets, and releases the lobby name only after commit.
  const seats = await game(host.client, "Atomic seats"), other = await game(outsider.client, "Other seats");
  const guestSeat = await join(guest.client, seats.code, "Reusable name"); const otherSeat = await join(outsider.client, other.code, "Other name");
  assert((await host.client.rpc("remove_player_guarded", { input_game_id: seats.game_id, input_player_id: otherSeat })).error, "cross-game removal target is denied");
  assert((await guest.client.rpc("remove_player_guarded", { input_game_id: seats.game_id, input_player_id: guestSeat })).error, "participant cannot remove seat");
  await rejectActivity(seats.game_id, () => host.client.rpc("remove_player_guarded", { input_game_id: seats.game_id, input_player_id: guestSeat }), async () => {
    const r = await admin.from("players").select("id").eq("id", guestSeat).maybeSingle(); assert(r.data?.id === guestSeat && await eventCount(seats.game_id, "player_removed") === 0, "failed removal preserves seat and reservation");
  });
  const replacement = await user("replacement");
  const blockedName = await replacement.client.rpc("join_game_guarded", { input_code: seats.code, input_player_name: "Reusable name", input_session_id: randomUUID() });
  assert(blockedName.error, "rejected removal keeps name reserved");
  assert(!(await host.client.rpc("remove_player_guarded", { input_game_id: seats.game_id, input_player_id: guestSeat })).error && await eventCount(seats.game_id, "player_removed") === 1, "removal retry deletes seat and writes one event");
  assert(await join(replacement.client, seats.code, "Reusable name"), "committed removal releases name reservation");

  // A non-host leaves only their own active seat; rejected event leaves the seat active.
  const leave = await game(host.client, "Atomic leave"); const leaveSeat = await join(guest.client, leave.code, "Leaving guest");
  assert((await outsider.client.rpc("leave_game_guarded", { input_game_id: leave.game_id, input_player_id: leaveSeat })).error, "outsider cannot leave another seat");
  await rejectActivity(leave.game_id, () => guest.client.rpc("leave_game_guarded", { input_game_id: leave.game_id, input_player_id: leaveSeat }), async () => {
    const r = await admin.from("players").select("left_at").eq("id", leaveSeat).single(); assert(r.data?.left_at == null && await eventCount(leave.game_id, "player_left") === 0, "failed leave keeps seat active");
  });
  assert(!(await guest.client.rpc("leave_game_guarded", { input_game_id: leave.game_id, input_player_id: leaveSeat })).error && await eventCount(leave.game_id, "player_left") === 1, "leave retry marks seat and writes one event");
  console.log("✓ lifecycle RPCs roll back on audit failure and enforce role, phase, target, and reservation semantics");
}
try { await run(); } finally { sql("drop trigger if exists test_reject_lifecycle_activity on public.game_events; drop function if exists public.test_reject_lifecycle_activity();"); for (const id of games) await admin.from("games").delete().eq("id", id); for (const id of users) await admin.auth.admin.deleteUser(id); }
