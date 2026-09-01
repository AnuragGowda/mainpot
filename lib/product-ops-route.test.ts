import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  gt: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { GET, POST } from "../app/api/product-ops/events/route";

const actorId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const journeyId = "33333333-3333-4333-8333-333333333333";

function request(
  idempotencyKey: string,
  event: "game.created" | "game.second_player_joined" | "game.entered_settling" | "game.finalized" = "game.second_player_joined"
) {
  return new Request("https://mainpot.app/api/product-ops/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://mainpot.app",
    },
    body: JSON.stringify({
      event,
      actorId,
      sessionId,
      journeyId,
      idempotencyKey,
      properties: { storage_mode: "supabase", room_code: "never-forward" },
    }),
  });
}

const collectorKey = "collector-test-key-that-is-at-least-32-chars";

function collectorRequest(path = "?after=0&limit=100", token = collectorKey) {
  return new Request(`https://mainpot.app/api/product-ops/events${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("Product Ops relay", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_PRODUCT_OPS_ENABLED = "true";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mainpot.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-key";
    process.env.PRODUCT_OPS_ACTOR_SALT = "test-only-salt";
    process.env.PRODUCT_OPS_COLLECTOR_KEY = collectorKey;
    process.env.VERCEL_ENV = "preview";
    mocks.from.mockReturnValue({ insert: mocks.insert, select: mocks.select });
    mocks.createClient.mockReturnValue({ from: mocks.from });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.select.mockReturnValue({ gt: mocks.gt });
    mocks.gt.mockReturnValue({ order: mocks.order });
    mocks.order.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_PRODUCT_OPS_ENABLED;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.PRODUCT_OPS_ACTOR_SALT;
    delete process.env.PRODUCT_OPS_COLLECTOR_KEY;
    delete process.env.VERCEL_ENV;
  });

  it("appends a pseudonymized, allowlisted event to the durable outbox", async () => {
    const response = await POST(request("44444444-4444-4444-8444-444444444444"));
    const row = mocks.insert.mock.calls[0][0] as Record<string, unknown>;

    expect(response.status).toBe(204);
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://mainpot.supabase.co",
      "server-only-key",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    expect(mocks.from).toHaveBeenCalledWith("product_ops_outbox");
    expect(row).toMatchObject({
      environment: "staging",
      event_name: "game.second_player_joined",
      properties: { storage_mode: "supabase" },
    });
    expect(row.actor_id).toMatch(/^anon_[0-9a-f]{64}$/);
    expect(row.session_id).toMatch(/^sess_[0-9a-f]{64}$/);
    expect(row.journey_id).toMatch(/^journey_[0-9a-f]{64}$/);
    expect(row.idempotency_key).toMatch(/^evt_[0-9a-f]{64}$/);
    expect(row.actor_id).not.toBe(row.session_id);
    const serializedRow = JSON.stringify(row);
    expect(serializedRow).not.toContain(actorId);
    expect(serializedRow).not.toContain(sessionId);
    expect(serializedRow).not.toContain(journeyId);
    expect(serializedRow).not.toContain("never-forward");
  });

  it("treats a duplicate lifecycle append as a successful no-op", async () => {
    mocks.insert
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { code: "23505" } });

    const first = await POST(request("44444444-4444-4444-8444-444444444444"));
    const second = await POST(request("55555555-5555-4555-8555-555555555555"));

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    const firstRow = mocks.insert.mock.calls[0][0] as Record<string, unknown>;
    const secondRow = mocks.insert.mock.calls[1][0] as Record<string, unknown>;
    expect(firstRow.idempotency_key).toBe(secondRow.idempotency_key);
  });

  it("preserves one journey and stable per-stage idempotency across the game lifecycle", async () => {
    const stages = [
      "game.created",
      "game.second_player_joined",
      "game.entered_settling",
      "game.finalized",
    ] as const;

    for (const [index, stage] of stages.entries()) {
      await POST(request(`44444444-4444-4444-8444-44444444444${index}`, stage));
      await POST(request(`55555555-5555-4555-8555-55555555555${index}`, stage));
    }

    const rows = mocks.insert.mock.calls.map(([row]) => row as Record<string, unknown>);
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((row) => row.journey_id))).toHaveLength(1);
    const keysByStage = new Map<string, Set<unknown>>();
    for (const row of rows) {
      const keys = keysByStage.get(row.event_name as string) ?? new Set<unknown>();
      keys.add(row.idempotency_key);
      keysByStage.set(row.event_name as string, keys);
    }
    expect(keysByStage.size).toBe(4);
    expect([...keysByStage.values()].every((keys) => keys.size === 1)).toBe(true);
    expect(new Set([...keysByStage.values()].map(([key]) => key))).toHaveLength(4);
  });

  it("separates a self-reported acquisition from browser referrer attribution", async () => {
    const selfReported = new Request("https://mainpot.app/api/product-ops/events", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://mainpot.app" },
      body: JSON.stringify({
        event: "acquisition.self_reported",
        actorId,
        sessionId,
        journeyId,
        idempotencyKey: "44444444-4444-4444-8444-444444444444",
        properties: { source: "poker_group", referrer: "never-forward" },
      }),
    });
    const referrer = new Request("https://mainpot.app/api/product-ops/events", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://mainpot.app" },
      body: JSON.stringify({
        event: "acquisition.referrer_attributed",
        actorId,
        sessionId,
        idempotencyKey: "55555555-5555-4555-8555-555555555555",
        properties: { source: "github", referrer: "never-forward" },
      }),
    });

    const selfReportedRetry = new Request("https://mainpot.app/api/product-ops/events", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://mainpot.app" },
      body: JSON.stringify({
        event: "acquisition.self_reported",
        actorId,
        sessionId,
        journeyId,
        idempotencyKey: "66666666-6666-4666-8666-666666666666",
        properties: { source: "poker_group" },
      }),
    });

    await POST(selfReported);
    await POST(selfReportedRetry);
    await POST(referrer);

    const selfReportedRow = mocks.insert.mock.calls[0][0] as Record<string, unknown>;
    const selfReportedRetryRow = mocks.insert.mock.calls[1][0] as Record<string, unknown>;
    const referrerRow = mocks.insert.mock.calls[2][0] as Record<string, unknown>;
    expect(selfReportedRow).toMatchObject({
      event_name: "acquisition.self_reported",
      properties: { source: "poker_group" },
      journey_id: expect.stringMatching(/^journey_/),
    });
    expect(selfReportedRetryRow.idempotency_key).toBe(selfReportedRow.idempotency_key);
    expect(referrerRow).toMatchObject({
      event_name: "acquisition.referrer_attributed",
      properties: { source: "github" },
      journey_id: null,
    });
    expect(JSON.stringify([selfReportedRow, referrerRow])).not.toContain("never-forward");
  });

  it("does not acknowledge a non-duplicate database error as a durable append", async () => {
    mocks.insert.mockResolvedValueOnce({ error: { code: "42501" } });

    const response = await POST(request("44444444-4444-4444-8444-444444444444"));

    // The browser telemetry caller ignores this response, so game play is not
    // affected; 503 still prevents a caller from treating the event as stored.
    expect(response.status).toBe(503);
  });

  it("does nothing when server-only outbox configuration is absent", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const response = await POST(request("44444444-4444-4444-8444-444444444444"));

    expect(response.status).toBe(204);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects collector pulls without the app-scoped bearer key", async () => {
    const response = await GET(collectorRequest("?after=0", "wrong-key"));

    expect(response.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("keeps the pull route disabled for an unsafe collector token length", async () => {
    process.env.PRODUCT_OPS_COLLECTOR_KEY = "too-short";

    const response = await GET(collectorRequest("?after=0", "too-short"));

    expect(response.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns an ascending keyset page with only projected pseudonymized fields", async () => {
    const rows = [{
      sequence: 43,
      environment: "staging",
      event_name: "game.created",
      occurred_at: "2026-09-01T00:00:00.000Z",
      actor_id: "anon_0123",
      session_id: "sess_4567",
      journey_id: "journey_89ab",
      properties: { storage_mode: "supabase" },
      idempotency_key: "evt_cdef",
      received_at: "2026-09-01T00:00:01.000Z",
    }];
    mocks.limit.mockResolvedValueOnce({ data: rows, error: null });

    const response = await GET(collectorRequest("?after=42&limit=2"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.from).toHaveBeenCalledWith("product_ops_outbox");
    expect(mocks.select).toHaveBeenCalledWith(
      "sequence,environment,event_name,occurred_at,actor_id,session_id,journey_id,properties,idempotency_key,received_at"
    );
    expect(mocks.gt).toHaveBeenCalledWith("sequence", "42");
    expect(mocks.order).toHaveBeenCalledWith("sequence", { ascending: true });
    expect(mocks.limit).toHaveBeenCalledWith(2);
    expect(await response.json()).toEqual({ events: rows });
    expect(JSON.stringify(rows)).not.toContain(actorId);
    expect(JSON.stringify(rows)).not.toContain(sessionId);
    expect(JSON.stringify(rows)).not.toContain(journeyId);
  });

  it("returns the documented empty-page envelope", async () => {
    const response = await GET(collectorRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ events: [] });
    expect(mocks.gt).toHaveBeenCalledWith("sequence", "0");
    expect(mocks.limit).toHaveBeenCalledWith(100);
  });
});
