import { createServerSupabase } from "@/lib/supabase-server";
import { getPushAdminClient, pushIsConfigured, sendWebPush } from "@/lib/push-server";
import type { GamePushEvent } from "@/lib/push-client";

const allowedEvents = new Set<GamePushEvent>([
  "player_joined",
  "game_settling",
  "game_finalized",
]);

interface DispatchBody {
  gameId?: unknown;
  event?: unknown;
  subjectPlayerId?: unknown;
}

interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function requestIsSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!pushIsConfigured()) return new Response(null, { status: 204 });
  if (!requestIsSameOrigin(request)) return new Response(null, { status: 403 });

  const client = await createServerSupabase();
  const admin = getPushAdminClient();
  if (!client || !admin) return new Response(null, { status: 204 });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return new Response(null, { status: 401 });

  const body = await request.json().catch(() => null) as DispatchBody | null;
  if (!body || !isUuid(body.gameId)
    || typeof body.event !== "string"
    || !allowedEvents.has(body.event as GamePushEvent)) {
    return new Response(null, { status: 400 });
  }
  const event = body.event as GamePushEvent;

  const [{ data: game }, { data: membership }] = await Promise.all([
    admin.from("games").select("id,code,name,status,host_user_id").eq("id", body.gameId).maybeSingle(),
    admin.from("players").select("id").eq("game_id", body.gameId).eq("user_id", user.id).limit(1).maybeSingle(),
  ]);
  if (!game || !membership) return new Response(null, { status: 403 });

  let subjectName: string | null = null;
  let dedupeKey: string = event;
  if (event === "player_joined") {
    if (!isUuid(body.subjectPlayerId)) return new Response(null, { status: 400 });
    const { data: subject } = await admin
      .from("players")
      .select("id,name,user_id,joined_at")
      .eq("id", body.subjectPlayerId)
      .eq("game_id", body.gameId)
      .maybeSingle();
    if (!subject || subject.user_id !== user.id
      || Date.now() - new Date(subject.joined_at).getTime() > 10 * 60 * 1000) {
      return new Response(null, { status: 403 });
    }
    subjectName = subject.name;
    dedupeKey = `${event}:${subject.id}`;
  } else {
    const requiredStatus = event === "game_settling" ? "settling" : "ended";
    if (game.host_user_id !== user.id || game.status !== requiredStatus) {
      return new Response(null, { status: 403 });
    }
  }

  const { error: claimError } = await admin.from("push_dispatches").insert({
    game_id: body.gameId,
    event_type: event,
    dedupe_key: dedupeKey,
  });
  if (claimError?.code === "23505") return new Response(null, { status: 204 });
  if (claimError) return new Response(null, { status: 500 });

  const { data: playerRows } = await admin
    .from("players")
    .select("user_id")
    .eq("game_id", body.gameId)
    .is("left_at", null);
  const recipientIds = [...new Set(
    (playerRows ?? [])
      .map((player) => player.user_id as string | null)
      .filter((id): id is string => Boolean(id) && id !== user.id)
  )];
  if (recipientIds.length === 0) return new Response(null, { status: 204 });

  const { data: rows, error: subscriptionsError } = await admin
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .in("user_id", recipientIds);
  if (subscriptionsError || !rows?.length) return new Response(null, { status: 204 });

  const playerCount = (playerRows ?? []).length;
  const content = event === "player_joined"
    ? {
        title: `${subjectName ?? "A player"} joined ${game.name}`,
        body: `${playerCount} ${playerCount === 1 ? "player is" : "players are"} at the table.`,
      }
    : event === "game_settling"
      ? { title: "Cash-outs are ready", body: `${game.name} is moving to settlement.` }
      : { title: "Settlement is ready", body: `${game.name}’s final payments are ready to review.` };
  const payload = {
    ...content,
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    tag: `mainpot-${body.gameId}-${event}`,
    url: `/game/${game.code}`,
  };

  const expiredEndpoints: string[] = [];
  const subscriptions = rows as PushSubscriptionRow[];
  const results = await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      await sendWebPush(subscription, payload, event === "player_joined" ? 600 : 86_400);
    } catch (cause) {
      const statusCode = (cause as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) expiredEndpoints.push(subscription.endpoint);
      throw cause;
    }
  }));

  if (expiredEndpoints.length) {
    await admin.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
  }
  const sent = results.filter((result) => result.status === "fulfilled").length;
  return Response.json({ sent }, { status: 202 });
}
