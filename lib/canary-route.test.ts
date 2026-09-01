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
    mocks.channel.mockReturnValue({ on: mocks.on, subscribe: mocks.subscribe });
    mocks.on.mockImplementation((_event, _filter, callback) => {
      mocks.change = callback as (payload: { new: { probe_id: string } }) => void;
      return { subscribe: mocks.subscribe };
    });
    mocks.subscribe.mockImplementation((callback) => {
      callback("SUBSCRIBED");
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
    vi.clearAllMocks();
    mocks.change = undefined;
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
    expect(await response.json()).toEqual({ status: "ok", database: true, realtime: true });
    expect(mocks.from).toHaveBeenCalledWith("product_ops_canary");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ probe_id: expect.any(String) }));
    expect(mocks.eq).toHaveBeenCalledWith("probe_id", expect.any(String));
    expect(mocks.removeChannel).toHaveBeenCalled();
  });
});
