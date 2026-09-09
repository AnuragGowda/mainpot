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
const games: string[] = [];
const users: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function expectDenied(
  operation: () => PromiseLike<{ data: unknown; error: unknown }>,
  label: string,
) {
  const result = await operation();
  assert(result.error || (Array.isArray(result.data) && result.data.length === 0), `${label} is denied`);
  return result;
}

async function permanent(label: string): Promise<{ id: string; client: SupabaseClient }> {
  const email = `audit-${label}-${randomUUID()}@example.test`;
  const password = `Audit-${randomUUID()}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: label },
  });
  if (createError || !created.user) throw createError ?? new Error("Could not create test user");
  users.push(created.user.id);

  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: created.user.id, client };
}

async function createGame(client: SupabaseClient, label: string) {
  const code = Array.from(
    { length: 6 },
    () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 30)],
  ).join("");
  const { data, error } = await client.rpc("create_game_guarded", {
    input_code: code,
    input_game_name: label,
    input_host_name: label,
    input_buy_in: 20,
    input_session_id: randomUUID(),
    input_host_is_playing: true,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as {
    game_id: string;
    player_id: string;
    code: string;
  } | null;
  assert(row?.game_id && row.player_id && row.code, "guarded game creation returns identifiers");
  games.push(row.game_id);
  return row;
}

async function joinGame(client: SupabaseClient, code: string, name: string) {
  const { data, error } = await client.rpc("join_game_guarded", {
    input_code: code,
    input_player_name: name,
    input_session_id: randomUUID(),
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { player_id: string } | null;
  assert(row?.player_id, "guarded join returns a player identifier");
  return row;
}

async function run() {
  const hostA = await permanent("audit-host-a");
  const hostB = await permanent("audit-host-b");
  const invitee = await permanent("audit-invitee");
  const outsider = await permanent("audit-outsider");
  const gameA = await createGame(hostA.client, "Audit game A");
  const gameB = await createGame(hostB.client, "Audit game B");
  const hostBInGameA = await joinGame(hostB.client, gameA.code, "Audit actor");

  const beforeEvents = await admin.from("game_events").select("id").eq("game_id", gameB.game_id);
  assert(!beforeEvents.error, "service role can count Game B events");
  await expectDenied(
    () => hostA.client.from("game_events").insert({
      game_id: gameB.game_id,
      event_type: "buy_in_updated",
      actor_player_id: gameA.player_id,
    }).select("id"),
    "cross-game event actor",
  );
  await expectDenied(
    () => hostA.client.from("game_events").insert({
      game_id: gameA.game_id,
      event_type: "buy_in_updated",
      actor_player_id: gameA.player_id,
      subject_player_id: gameB.player_id,
    }).select("id"),
    "cross-game event subject",
  );
  const afterDenied = await admin.from("game_events").select("id").eq("game_id", gameB.game_id);
  assert(afterDenied.data?.length === beforeEvents.data?.length, "denied cross-game events are not persisted");

  const validEvent = await hostA.client.from("game_events").insert({
    game_id: gameA.game_id,
    event_type: "buy_in_updated",
    actor_player_id: gameA.player_id,
  }).select("id").single();
  assert(!validEvent.error && validEvent.data?.id, "same-game host audit append remains valid");
  const actorEvent = await hostB.client.from("game_events").insert({
    game_id: gameA.game_id,
    event_type: "buy_in_updated",
    actor_player_id: hostBInGameA.player_id,
  }).select("id").single();
  assert(!actorEvent.error && actorEvent.data?.id, "same-game player audit append remains valid");
  await expectDenied(
    () => hostA.client.from("game_events").update({ amount: 999 }).eq("id", validEvent.data.id).select("id"),
    "audit event update",
  );
  await expectDenied(
    () => hostA.client.from("game_events").delete().eq("id", validEvent.data.id).select("id"),
    "audit event delete",
  );
  const canonicalEvent = await admin.from("game_events").select("amount").eq("id", validEvent.data.id).single();
  assert(!canonicalEvent.error && canonicalEvent.data?.amount === null, "audit event stays immutable");
  console.log("✓ audit events reject cross-game references and remain append-only");

  const pendingFriendship = await hostA.client.from("friendships").insert({
    requester_id: hostA.id,
    addressee_id: invitee.id,
    status: "pending",
  }).select("id").single();
  assert(!pendingFriendship.error && pendingFriendship.data?.id, "sender creates a pending friendship");
  await expectDenied(
    () => hostA.client.from("friendships").update({ status: "accepted" }).eq("id", pendingFriendship.data.id).select("id"),
    "sender direct friendship acceptance",
  );
  await expectDenied(
    () => hostA.client.rpc("respond_to_friend_request", {
      input_friendship_id: pendingFriendship.data.id,
      input_status: "accepted",
    }),
    "sender guarded friendship acceptance",
  );
  const acceptedFriendship = await invitee.client.rpc("respond_to_friend_request", {
    input_friendship_id: pendingFriendship.data.id,
    input_status: "accepted",
  });
  assert(!acceptedFriendship.error && acceptedFriendship.data?.status === "accepted", "recipient accepts friendship");
  await expectDenied(
    () => invitee.client.rpc("respond_to_friend_request", {
      input_friendship_id: pendingFriendship.data.id,
      input_status: "declined",
    }),
    "terminal friendship response",
  );
  await expectDenied(
    () => hostA.client.from("friendships").insert({
      requester_id: hostA.id,
      addressee_id: hostA.id,
      status: "pending",
    }).select("id"),
    "self friendship",
  );
  await expectDenied(
    () => hostA.client.from("friendships").insert({
      requester_id: hostA.id,
      addressee_id: outsider.id,
      status: "accepted",
    }).select("id"),
    "pre-accepted friendship",
  );
  const cancelledFriendship = await hostB.client.from("friendships").insert({
    requester_id: hostB.id,
    addressee_id: outsider.id,
    status: "pending",
  }).select("id").single();
  assert(!cancelledFriendship.error && cancelledFriendship.data?.id, "sender creates cancellable request");
  const cancelled = await hostB.client.from("friendships").delete().eq("id", cancelledFriendship.data.id).select("id");
  assert(!cancelled.error && cancelled.data?.length === 1, "sender can cancel a pending request");
  const declinedFriendship = await hostB.client.from("friendships").insert({
    requester_id: hostB.id,
    addressee_id: outsider.id,
    status: "pending",
  }).select("id").single();
  assert(!declinedFriendship.error && declinedFriendship.data?.id, "sender creates declinable request");
  const declinedFriendshipResponse = await outsider.client.rpc("respond_to_friend_request", {
    input_friendship_id: declinedFriendship.data.id,
    input_status: "declined",
  });
  assert(!declinedFriendshipResponse.error && declinedFriendshipResponse.data?.status === "declined", "recipient declines friendship");
  const removedFriendship = await hostA.client.from("friendships").delete().eq("id", pendingFriendship.data.id).select("id");
  assert(!removedFriendship.error && removedFriendship.data?.length === 1, "either party can remove an accepted friendship");
  console.log("✓ only friendship recipients can resolve pending requests");

  const invitation = await hostA.client.rpc("send_game_invite", {
    input_game_id: gameA.game_id,
    input_invitee_id: invitee.id,
  });
  assert(!invitation.error && invitation.data?.id, "host creates a pending invitation");
  const inboxBeforeAccept = await invitee.client.rpc("get_my_incoming_game_invites");
  assert(inboxBeforeAccept.data?.length === 1, "invitee receives one inbox row");
  const inboxGame = inboxBeforeAccept.data?.[0]?.game as Record<string, unknown>;
  assert(inboxGame.name === "Audit game A" && !("code" in inboxGame), "inbox exposes only display metadata");
  const noGameBeforeAccept = await invitee.client.from("games").select("id").eq("id", gameA.game_id);
  assert(!noGameBeforeAccept.error && noGameBeforeAccept.data?.length === 0, "pending invite does not grant game access");
  const noEventsBeforeAccept = await invitee.client.from("game_events").select("id").eq("game_id", gameA.game_id);
  assert(!noEventsBeforeAccept.error && noEventsBeforeAccept.data?.length === 0, "pending invite does not grant ledger reads");
  const outsiderInbox = await outsider.client.rpc("get_my_incoming_game_invites");
  assert(!outsiderInbox.error && outsiderInbox.data?.length === 0, "unrelated account has no invitation metadata");
  await expectDenied(
    () => hostA.client.rpc("respond_to_game_invite", {
      input_invite_id: invitation.data.id,
      input_status: "accepted",
    }),
    "inviter accepting an invitation",
  );
  await expectDenied(
    () => invitee.client.from("game_invites").update({ game_id: gameB.game_id }).eq("id", invitation.data.id).select("id"),
    "invite endpoint rewrite",
  );
  const acceptedInvite = await invitee.client.rpc("respond_to_game_invite", {
    input_invite_id: invitation.data.id,
    input_status: "accepted",
  });
  assert(!acceptedInvite.error && acceptedInvite.data === gameA.code, "accepting returns the redirect code");
  const gameAfterAccept = await invitee.client.from("games").select("id").eq("id", gameA.game_id);
  assert(!gameAfterAccept.error && gameAfterAccept.data?.length === 1, "accepted invite grants game access");

  const endedInviteGame = await createGame(hostA.client, "Audit ended invite game");
  const endedInvitation = await hostA.client.rpc("send_game_invite", {
    input_game_id: endedInviteGame.game_id,
    input_invitee_id: invitee.id,
  });
  assert(!endedInvitation.error && endedInvitation.data?.id, "host creates ended-game invitation fixture");
  const ended = await admin.from("games").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", endedInviteGame.game_id);
  assert(!ended.error, "service role ends invitation fixture");
  const inboxAfterEnd = await invitee.client.rpc("get_my_incoming_game_invites");
  assert(inboxAfterEnd.data?.length === 0, "ended games are absent from the invitation inbox");

  const reInviteGame = await createGame(hostA.client, "Audit re-invite game");
  const declinedInvite = await hostA.client.rpc("send_game_invite", {
    input_game_id: reInviteGame.game_id,
    input_invitee_id: invitee.id,
  });
  assert(!declinedInvite.error && declinedInvite.data?.id, "host creates re-invite fixture");
  const decline = await invitee.client.rpc("respond_to_game_invite", {
    input_invite_id: declinedInvite.data.id,
    input_status: "declined",
  });
  assert(!decline.error && decline.data === null, "decline returns no room code");
  const resent = await hostA.client.rpc("send_game_invite", {
    input_game_id: reInviteGame.game_id,
    input_invitee_id: invitee.id,
  });
  assert(!resent.error && resent.data?.status === "pending", "host explicitly re-sends a declined invitation");
  console.log("✓ invitation inbox is scoped, acceptance grants access, and declined invitations can be re-sent");
}

try {
  await run();
  console.log("Audit security regression checks passed.");
} finally {
  for (const gameId of games) await admin.from("games").delete().eq("id", gameId);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}
