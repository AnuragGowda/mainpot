import { getSessionId, randomUUID } from "./session";

export type ProductOpsEvent =
  | "game.created"
  | "game.create_failed"
  | "game.room_load_failed"
  | "game.second_player_joined"
  | "game.entered_settling"
  | "game.finalized"
  | "host.returned_to_create"
  | "acquisition.referrer_attributed"
  | "acquisition.self_reported"
  | "feedback.submitted";

type Properties = Record<string, string | number | boolean>;
export type ProductOpsFailureReason = "auth" | "guardrail" | "network" | "database" | "unknown";
const PRODUCT_OPS_SESSION_KEY = "mainpot_product_ops_session_id";
const PRODUCT_OPS_RELAY_TIMEOUT_MS = 3_000;

/** Reduces arbitrary client errors to a small, privacy-safe diagnostic bucket. */
export function classifyProductOpsFailure(error: unknown): ProductOpsFailureReason {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code.toLowerCase() : "";
  const message = typeof candidate?.message === "string" ? candidate.message.toLowerCase() : "";
  const detail = `${code} ${message}`;

  if (/auth|jwt|refresh|session/.test(detail)) return "auth";
  if (/limit|too many requests|active guest game/.test(detail)) return "guardrail";
  if (/fetch|network|offline|timeout|abort/.test(detail)) return "network";
  if (code || /database|relation|column|row|rpc|postgres/.test(detail)) return "database";
  return "unknown";
}

function getProductOpsSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(PRODUCT_OPS_SESSION_KEY);
    if (existing) return existing;
    const sessionId = randomUUID();
    window.sessionStorage.setItem(PRODUCT_OPS_SESSION_KEY, sessionId);
    return sessionId;
  } catch {
    return randomUUID();
  }
}

function getProductOpsActorId(): string {
  try {
    return getSessionId();
  } catch {
    return randomUUID();
  }
}

/**
 * A deliberately tiny browser-to-server relay. No Product Ops secret is ever
 * shipped to the browser, and every failure is ignored by the product flow.
 */
export function productOpsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PRODUCT_OPS_ENABLED === "true";
}

async function relayProductOpsEvent(body: string): Promise<boolean> {
  const send = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PRODUCT_OPS_RELAY_TIMEOUT_MS);
    try {
      return await fetch("/api/product-ops/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if ((await send()).ok) return true;
    } catch {
      // A failed attempt is retried once with the same serialized identity.
    }
  }
  return false;
}

export function trackProductOpsEvent(
  event: ProductOpsEvent,
  properties: Properties = {},
  journeyId?: string
): Promise<boolean> {
  if (!productOpsEnabled() || typeof window === "undefined") return Promise.resolve(false);

  try {
    const body = JSON.stringify({
      event,
      actorId: getProductOpsActorId(),
      sessionId: getProductOpsSessionId(),
      journeyId,
      idempotencyKey: randomUUID(),
      properties,
    });
    return relayProductOpsEvent(body);
  } catch {
    return Promise.resolve(false);
  }
}
