import crypto from "node:crypto";

const events = new Set([
  "game.created",
  "game.second_player_joined",
  "game.entered_settling",
  "game.finalized",
  "host.returned_to_create",
  "acquisition.attributed",
  "feedback.submitted",
]);
const sources = new Set(["direct", "github", "documentation", "self_hosted", "other"]);
const storageModes = new Set(["local_storage", "supabase"]);

type Payload = {
  event?: unknown;
  actorId?: unknown;
  sessionId?: unknown;
  idempotencyKey?: unknown;
  properties?: unknown;
};

function enabled(): boolean {
  return process.env.NEXT_PUBLIC_PRODUCT_OPS_ENABLED === "true"
    && Boolean(process.env.PRODUCT_OPS_ENDPOINT)
    && Boolean(process.env.PRODUCT_OPS_INGESTION_KEY)
    && Boolean(process.env.PRODUCT_OPS_ACTOR_SALT);
}

function opaqueId(prefix: "anon" | "sess", value: string): string {
  const digest = crypto.createHmac("sha256", process.env.PRODUCT_OPS_ACTOR_SALT!).update(value).digest("hex");
  return `${prefix}_${digest}`;
}

function safeProperties(event: string, properties: unknown): Record<string, string | number | boolean> | null {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return {};
  const candidate = properties as Record<string, unknown>;
  if (event === "acquisition.attributed") return typeof candidate.source === "string" && sources.has(candidate.source) ? { source: candidate.source } : null;
  if (["game.created", "game.second_player_joined", "game.entered_settling", "game.finalized"].includes(event)) return typeof candidate.storage_mode === "string" && storageModes.has(candidate.storage_mode) ? { storage_mode: candidate.storage_mode } : null;
  if (event === "feedback.submitted") {
    const score = candidate.score;
    return typeof score === "number" && Number.isInteger(score) && score >= 1 && score <= 5 ? { score, feedback_present: candidate.feedback_present === true } : null;
  }
  return {};
}

export async function POST(request: Request) {
  if (!enabled()) return new Response(null, { status: 204 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 204 });

  const body = await request.json().catch(() => null) as Payload | null;
  if (!body || typeof body.event !== "string" || !events.has(body.event)
    || typeof body.actorId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.actorId)
    || typeof body.sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.sessionId)
    || typeof body.idempotencyKey !== "string" || !/^[0-9a-f-]{36}$/i.test(body.idempotencyKey)) return new Response(null, { status: 204 });
  const properties = safeProperties(body.event, body.properties);
  if (!properties) return new Response(null, { status: 204 });

  try {
    await fetch(`${process.env.PRODUCT_OPS_ENDPOINT!.replace(/\/$/, "")}/api/v1/events`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.PRODUCT_OPS_INGESTION_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ version: "1.0", app: "mainpot", environment: process.env.NODE_ENV === "production" ? "production" : "development", event: body.event, timestamp: new Date().toISOString(), actorId: opaqueId("anon", body.actorId), sessionId: opaqueId("sess", body.sessionId), idempotencyKey: body.idempotencyKey, properties }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Deliberately invisible to callers: this endpoint is a best-effort relay.
  }
  return new Response(null, { status: 204 });
}
