import { getSessionId, randomUUID } from "./session";

export type ProductOpsEvent =
  | "game.created"
  | "game.second_player_joined"
  | "game.entered_settling"
  | "game.finalized"
  | "host.returned_to_create"
  | "acquisition.referrer_attributed"
  | "acquisition.self_reported"
  | "feedback.submitted";

type Properties = Record<string, string | number | boolean>;
const PRODUCT_OPS_SESSION_KEY = "mainpot_product_ops_session_id";

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

/**
 * A deliberately tiny browser-to-server relay. No Product Ops secret is ever
 * shipped to the browser, and every failure is ignored by the product flow.
 */
export function productOpsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PRODUCT_OPS_ENABLED === "true";
}

async function relayProductOpsEvent(body: string): Promise<void> {
  const send = () => fetch("/api/product-ops/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  });

  try {
    const first = await send();
    if (!first.ok) await send();
  } catch {
    // Analytics is optional and must never affect the product.
  }
}

export function trackProductOpsEvent(
  event: ProductOpsEvent,
  properties: Properties = {},
  journeyId?: string
): void {
  if (!productOpsEnabled() || typeof window === "undefined") return;

  void relayProductOpsEvent(JSON.stringify({
      event,
      actorId: getSessionId(),
      sessionId: getProductOpsSessionId(),
      journeyId,
      idempotencyKey: randomUUID(),
      properties,
    }));
}
