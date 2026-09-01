import { createServerSupabase } from "@/lib/supabase-server";
import { pushIsConfigured } from "@/lib/push-server";

interface SubscriptionBody {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

function requestIsSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 12 || value.length > 2048) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validKey(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 8
    && value.length <= 512
    && /^[A-Za-z0-9_-]+$/.test(value);
}

async function authenticatedClient() {
  const client = await createServerSupabase();
  if (!client) return null;
  const { data: { user }, error } = await client.auth.getUser();
  return error || !user ? null : { client, user };
}

export async function POST(request: Request) {
  if (!pushIsConfigured()) {
    return Response.json({ error: "Game alerts are not configured." }, { status: 503 });
  }
  if (!requestIsSameOrigin(request)) return new Response(null, { status: 403 });

  const auth = await authenticatedClient();
  if (!auth) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => null) as SubscriptionBody | null;
  if (!body || !validEndpoint(body.endpoint)
    || !validKey(body.keys?.p256dh) || !validKey(body.keys?.auth)) {
    return Response.json({ error: "The browser returned an invalid push subscription." }, { status: 400 });
  }

  const { error } = await auth.client.from("push_subscriptions").upsert({
    user_id: auth.user.id,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    user_agent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) {
    return Response.json({ error: "Mainpot could not save this notification subscription." }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}

export async function DELETE(request: Request) {
  if (!requestIsSameOrigin(request)) return new Response(null, { status: 403 });
  const auth = await authenticatedClient();
  if (!auth) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  if (!validEndpoint(body?.endpoint)) return new Response(null, { status: 400 });

  const { error } = await auth.client
    .from("push_subscriptions")
    .delete()
    .eq("user_id", auth.user.id)
    .eq("endpoint", body.endpoint);
  if (error) return new Response(null, { status: 500 });
  return new Response(null, { status: 204 });
}
