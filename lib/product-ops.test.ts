import { afterEach, describe, expect, it, vi } from "vitest";
import { trackProductOpsEvent } from "./product-ops";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("Product Ops browser relay", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_PRODUCT_OPS_ENABLED;
  });

  it("retries one non-OK append with the same idempotency payload", async () => {
    process.env.NEXT_PUBLIC_PRODUCT_OPS_ENABLED = "true";
    vi.stubGlobal("window", { localStorage: storage(), sessionStorage: storage() });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    trackProductOpsEvent("game.created", { storage_mode: "supabase" }, "33333333-3333-4333-8333-333333333333");

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/product-ops/events");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ keepalive: true });
    expect(fetchMock.mock.calls[1][1]?.body).toBe(fetchMock.mock.calls[0][1]?.body);
  });
});
