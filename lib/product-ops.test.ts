import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyProductOpsFailure, trackProductOpsEvent } from "./product-ops";

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

    await expect(trackProductOpsEvent(
      "game.created",
      { storage_mode: "supabase" },
      "33333333-3333-4333-8333-333333333333",
    )).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/product-ops/events");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ keepalive: true, signal: expect.any(AbortSignal) });
    expect(fetchMock.mock.calls[1][1]?.body).toBe(fetchMock.mock.calls[0][1]?.body);
  });

  it("retries a thrown fetch with the same serialized identity", async () => {
    process.env.NEXT_PUBLIC_PRODUCT_OPS_ENABLED = "true";
    vi.stubGlobal("window", { localStorage: storage(), sessionStorage: storage() });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(trackProductOpsEvent("game.created", { storage_mode: "supabase" })).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.body).toBe(fetchMock.mock.calls[0][1]?.body);
  });

  it("does not throw when browser storage is unavailable", async () => {
    process.env.NEXT_PUBLIC_PRODUCT_OPS_ENABLED = "true";
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => { throw new Error("storage blocked"); },
        setItem: () => { throw new Error("storage blocked"); },
      },
      sessionStorage: storage(),
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(trackProductOpsEvent("game.created", { storage_mode: "supabase" })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not throw when telemetry properties cannot be serialized", async () => {
    process.env.NEXT_PUBLIC_PRODUCT_OPS_ENABLED = "true";
    vi.stubGlobal("window", { localStorage: storage(), sessionStorage: storage() });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expect(trackProductOpsEvent(
      "game.created",
      circular as unknown as { storage_mode: "supabase" },
    )).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reduces client errors to privacy-safe diagnostic categories", () => {
    expect(classifyProductOpsFailure(new Error("Failed to fetch"))).toBe("network");
    expect(classifyProductOpsFailure(new Error("Finish your active guest game before starting another."))).toBe("guardrail");
    expect(classifyProductOpsFailure({ code: "PGRST205", message: "Missing relation" })).toBe("database");
    expect(classifyProductOpsFailure(new Error("Invalid refresh token"))).toBe("auth");
    expect(classifyProductOpsFailure(new Error("Unexpected failure"))).toBe("unknown");
  });
});
