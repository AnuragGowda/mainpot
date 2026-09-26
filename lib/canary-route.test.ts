import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  channel: vi.fn(),
  on: vi.fn(),
  subscribe: vi.fn(),
  removeChannel: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
  system: undefined as undefined | ((payload: { extension: string; status: string }) => void),
  change: undefined as undefined | ((payload: { new: { probe_id: string } }) => void),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { POST } from "../app/api/health/canary/route";

const canaryKey = "canary-test-key-that-is-at-least-32-characters";

function request(token = canaryKey) {
  return new Request("https://mainpot.app/api/health/canary", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("Mainpot database and Realtime canary", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mainpot.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-key";
    process.env.MAINPOT_CANARY_KEY = canaryKey;
    const channel = { on: mocks.on, subscribe: mocks.subscribe };
    mocks.channel.mockReturnValue(channel);
    mocks.on.mockImplementation((event, _filter, callback) => {
      if (event === "postgres_changes") mocks.change = callback;
      if (event === "system") mocks.system = callback;
      return channel;
    });
    mocks.subscribe.mockImplementation((callback) => {
      callback("SUBSCRIBED");
      mocks.system?.({ extension: "postgres_changes", status: "ok" });
      return {};
    });
    mocks.from.mockReturnValue({ insert: mocks.insert, delete: mocks.delete });
    mocks.insert.mockImplementation(async (row) => {
      mocks.change?.({ new: { probe_id: row.probe_id } });
      return { error: null };
    });
    mocks.delete.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ error: null });
    mocks.createClient
      .mockReturnValueOnce({ from: mocks.from })
      .mockReturnValueOnce({ channel: mocks.channel, removeChannel: mocks.removeChannel });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.change = undefined;
    mocks.system = undefined;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.MAINPOT_CANARY_KEY;
  });

  it("requires its separate app-scoped bearer token", async () => {
    const response = await POST(request("wrong-key"));

    expect(response.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("probes only the synthetic table and removes the row after receiving Realtime", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", database: true, realtime: true });
    expect(mocks.from).toHaveBeenCalledWith("product_ops_canary");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ probe_id: expect.any(String) }));
    expect(mocks.eq).toHaveBeenCalledWith("probe_id", expect.any(String));
    expect(mocks.removeChannel).toHaveBeenCalled();
  });

  it("allows Realtime change delivery beyond the former 1.5 second budget", async () => {
    vi.useFakeTimers();
    mocks.insert.mockImplementationOnce(async (row) => {
      setTimeout(() => {
        mocks.change?.({ new: { probe_id: row.probe_id } });
      }, 1_750);
      return { error: null };
    });

    const responsePromise = POST(request());
    await vi.advanceTimersByTimeAsync(1_750);
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      database: true,
      realtime: true,
    });
  });

  it("does not insert when the SDK joins without PostgreSQL readiness", async () => {
    vi.useFakeTimers();
    mocks.subscribe.mockImplementationOnce((callback) => { callback("SUBSCRIBED"); });
    const pending = POST(request());
    await vi.advanceTimersByTimeAsync(2_999);
    expect(mocks.insert).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ subscription: false, database: false, realtime: false, cleanup: true });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.removeChannel).toHaveBeenCalled();
  });

  it("accepts PostgreSQL readiness before the SDK join acknowledgment", async () => {
    mocks.subscribe.mockImplementationOnce((callback) => {
      expect(mocks.system).toBeTypeOf("function");
      mocks.system?.({ extension: "postgres_changes", status: "ok" });
      expect(mocks.insert).not.toHaveBeenCalled();
      callback("SUBSCRIBED");
    });
    expect((await POST(request())).status).toBe(200);
  });

  it("fails PostgreSQL subscription errors without inserting, even if a later join succeeds", async () => {
    mocks.subscribe.mockImplementationOnce((callback) => {
      mocks.system?.({ extension: "postgres_changes", status: "error" });
      callback("SUBSCRIBED");
      mocks.system?.({ extension: "postgres_changes", status: "ok" });
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ subscription: false, cleanup: true });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.removeChannel).toHaveBeenCalled();
  });

  it("does not treat broadcast replication readiness as PostgreSQL readiness", async () => {
    vi.useFakeTimers();
    mocks.subscribe.mockImplementationOnce((callback) => {
      callback("SUBSCRIBED");
      mocks.system?.({ extension: "system", status: "ok" });
    });
    const pending = POST(request());
    await vi.advanceTimersByTimeAsync(3_000);
    expect((await pending).status).toBe(503);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("uses a single three-second budget for both subscription acknowledgments", async () => {
    vi.useFakeTimers();
    mocks.subscribe.mockImplementationOnce((callback) => {
      setTimeout(() => callback("SUBSCRIBED"), 2_500);
      setTimeout(() => mocks.system?.({ extension: "postgres_changes", status: "ok" }), 3_001);
    });
    const pending = POST(request());
    await vi.advanceTimersByTimeAsync(3_000);
    const response = await pending;
    expect(response.status).toBe(503);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("requires the SDK acknowledgment even when PostgreSQL is ready", async () => {
    vi.useFakeTimers();
    mocks.subscribe.mockImplementationOnce(() => {
      mocks.system?.({ extension: "postgres_changes", status: "ok" });
    });
    const pending = POST(request());
    await vi.advanceTimersByTimeAsync(3_000);
    expect((await pending).status).toBe(503);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("keeps HTTP insert latency within the existing delivery deadline", async () => {
    vi.useFakeTimers();
    mocks.insert.mockImplementationOnce(async (row) => {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      setTimeout(() => mocks.change?.({ new: { probe_id: row.probe_id } }), 501);
      return { error: null };
    });
    const pending = POST(request());
    await vi.advanceTimersByTimeAsync(3_000);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ database: true, subscription: true, realtime: false, cleanup: true });
    expect(mocks.eq).toHaveBeenCalledWith("probe_id", expect.any(String));
  });

  it("cleans up the exact probe after a lost insert acknowledgment", async () => {
    mocks.insert.mockRejectedValueOnce(new Error("Connection lost after dispatch"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.eq).toHaveBeenCalledWith("probe_id", expect.any(String));
    expect(mocks.removeChannel).toHaveBeenCalled();
  });

});
