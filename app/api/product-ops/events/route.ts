import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const events = new Set([
  "game.created",
  "game.second_player_joined",
  "game.entered_settling",
  "game.finalized",
  "host.returned_to_create",
  "acquisition.referrer_attributed",
  "acquisition.self_reported",
  "feedback.submitted",
]);
const referrerSources = new Set(["direct", "github", "documentation", "self_hosted", "other"]);
const selfReportedSources = new Set(["personal_invite", "poker_group", "search", "other"]);
const storageModes = new Set(["local_storage", "supabase"]);

type Payload = {
  event?: unknown;
  actorId?: unknown;
  sessionId?: unknown;
  journeyId?: unknown;
  idempotencyKey?: unknown;
  properties?: unknown;
};

const outboxColumns = "sequence,environment,event_name,occurred_at,actor_id,session_id,journey_id,properties,idempotency_key,received_at";

function enabled(): boolean {
  return process.env.NEXT_PUBLIC_PRODUCT_OPS_ENABLED === "true"
    && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
    && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    && Boolean(process.env.PRODUCT_OPS_ACTOR_SALT);
}

function collectorEnabled(): boolean {
  const collectorKey = process.env.PRODUCT_OPS_COLLECTOR_KEY;
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
      && process.env.SUPABASE_SERVICE_ROLE_KEY
      && collectorKey
      && collectorKey.length >= 32
  );
}

function opaqueId(prefix: "anon" | "sess" | "journey" | "evt", value: string): string {
  const digest = crypto.createHmac("sha256", process.env.PRODUCT_OPS_ACTOR_SALT!).update(value).digest("hex");
  return `${prefix}_${digest}`;
}

function safeProperties(event: string, properties: unknown): Record<string, string | number | boolean> | null {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return {};
  const candidate = properties as Record<string, unknown>;
  if (event === "acquisition.referrer_attributed") return typeof candidate.source === "string" && referrerSources.has(candidate.source) ? { source: candidate.source } : null;
  if (event === "acquisition.self_reported") return typeof candidate.source === "string" && selfReportedSources.has(candidate.source) ? { source: candidate.source } : null;
  if (["game.created", "game.second_player_joined", "game.entered_settling", "game.finalized"].includes(event)) return typeof candidate.storage_mode === "string" && storageModes.has(candidate.storage_mode) ? { storage_mode: candidate.storage_mode } : null;
  if (event === "feedback.submitted") {
    const score = candidate.score;
    return typeof score === "number" && Number.isInteger(score) && score >= 1 && score <= 5 ? { score, feedback_present: candidate.feedback_present === true } : null;
  }
  return {};
}

function environment(): "development" | "staging" | "production" {
  if (process.env.VERCEL_ENV === "preview") return "staging";
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") return "production";
  return "development";
}

function lifecycleIdempotencyKey(event: string, journeyId: string | undefined, actorId: string, clientKey: string): string {
  const lifecycleEvents = new Set([
    "game.created",
    "game.second_player_joined",
    "game.entered_settling",
    "game.finalized",
    "host.returned_to_create",
    "acquisition.self_reported",
  ]);
  const scope = journeyId ?? actorId;
  return opaqueId("evt", lifecycleEvents.has(event) ? `${event}:${scope}` : `${event}:${clientKey}`);
}

function requestIsSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function collectorIsAuthorized(request: Request): boolean {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const expected = process.env.PRODUCT_OPS_COLLECTOR_KEY ?? "";
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return tokenBuffer.length === expectedBuffer.length
    && tokenBuffer.length > 0
    && crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
}

function pullParameters(request: Request): { after: string; limit: number } | null {
  const url = new URL(request.url);
  const rawAfter = url.searchParams.get("after") ?? "0";
  const limit = url.searchParams.get("limit") ?? "100";
  if (!/^\d+$/.test(rawAfter) || !/^\d+$/.test(limit)) return null;
  const after = rawAfter.replace(/^0+/, "") || "0";
  if (after.length > 19 || (after.length === 19 && after > "9223372036854775807")) return null;
  const parsedLimit = Number(limit);
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) return null;
  return { after, limit: parsedLimit };
}

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!collectorEnabled() || !collectorIsAuthorized(request)) {
    return new Response(null, { status: 401, headers: { "www-authenticate": "Bearer" } });
  }
  const parameters = pullParameters(request);
  if (!parameters) return new Response(null, { status: 400 });

  try {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data, error } = await client
      .from("product_ops_outbox")
      .select(outboxColumns)
      .gt("sequence", parameters.after)
      .order("sequence", { ascending: true })
      .limit(parameters.limit);
    if (error) return new Response(null, { status: 503 });
    return Response.json({ events: data ?? [] }, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!enabled()) return new Response(null, { status: 204 });
  if (!requestIsSameOrigin(request)) return new Response(null, { status: 204 });

  const body = await request.json().catch(() => null) as Payload | null;
  if (!body || typeof body.event !== "string" || !events.has(body.event)
    || typeof body.actorId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.actorId)
    || typeof body.sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.sessionId)
    || (body.journeyId !== undefined && (typeof body.journeyId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.journeyId)))
    || typeof body.idempotencyKey !== "string" || !/^[0-9a-f-]{36}$/i.test(body.idempotencyKey)) return new Response(null, { status: 204 });
  const properties = safeProperties(body.event, body.properties);
  if (!properties) return new Response(null, { status: 204 });
  const actorId = opaqueId("anon", body.actorId);
  const sessionId = opaqueId("sess", body.sessionId);
  const journeyId = typeof body.journeyId === "string" ? opaqueId("journey", body.journeyId) : undefined;
  const idempotencyKey = lifecycleIdempotencyKey(body.event, journeyId, actorId, body.idempotencyKey);

  try {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { error } = await client.from("product_ops_outbox").insert({
      environment: environment(),
      event_name: body.event,
      occurred_at: new Date().toISOString(),
      actor_id: actorId,
      session_id: sessionId,
      journey_id: journeyId ?? null,
      properties,
      idempotency_key: idempotencyKey,
    });
    if (error?.code === "23505") return new Response(null, { status: 204 });
    if (error) return new Response(null, { status: 503 });
  } catch {
    // Deliberately invisible to callers: telemetry must not affect game flows.
    return new Response(null, { status: 503 });
  }
  return new Response(null, { status: 204 });
}
