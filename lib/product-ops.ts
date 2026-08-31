import { getSessionId, randomUUID } from "./session";

export type ProductOpsEvent =
  | "game.created"
  | "game.second_player_joined"
  | "game.entered_settling"
  | "game.finalized"
  | "host.returned_to_create"
  | "acquisition.attributed"
  | "feedback.submitted";

type Properties = Record<string, string | number | boolean>;

/**
 * A deliberately tiny browser-to-server relay. No Product Ops secret is ever
 * shipped to the browser, and every failure is ignored by the product flow.
 */
export function productOpsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PRODUCT_OPS_ENABLED === "true";
}

export function trackProductOpsEvent(
  event: ProductOpsEvent,
  properties: Properties = {}
): void {
  if (!productOpsEnabled() || typeof window === "undefined") return;

  void fetch("/api/product-ops/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event,
      actorId: getSessionId(),
      sessionId: getSessionId(),
      idempotencyKey: randomUUID(),
      properties,
    }),
    keepalive: true,
  }).catch(() => {
    // Analytics is optional and must never affect the product.
  });
}
