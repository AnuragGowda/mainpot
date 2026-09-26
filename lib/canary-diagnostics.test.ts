import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ subscribed: true, deliver: true, deleteError: false, insertError: false, inserted: "", deleted: [] as string[], change: undefined as undefined | ((payload: { new: { probe_id: string } }) => void) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({
  from: () => ({
    insert: async ({ probe_id }: { probe_id: string }) => {
      state.inserted = probe_id;
      if (state.deliver) state.change?.({ new: { probe_id } });
      return { error: state.insertError ? new Error("Lost insert acknowledgment") : null };
    },
    delete: () => ({ eq: async (_column: string, probeId: string) => {
      state.deleted.push(probeId);
      return { error: state.deleteError ? new Error("Injected cleanup failure") : null };
    } }),
  }),
  channel: () => {
    const channel = {
      on: (_kind: string, _filter: unknown, handler: typeof state.change) => { state.change = handler; return channel; },
      subscribe: (handler: (status: string) => void) => { if (state.subscribed) handler("SUBSCRIBED"); return channel; },
    };
    return channel;
  },
  removeChannel: async () => undefined,
}) }));
import { POST } from "../app/api/health/canary/route";
function request() { return new Request("https://mainpot.test/api/health/canary", { method: "POST", headers: { authorization: "Bearer " + "test-canary-key-".padEnd(40, "x") } }); }
describe("production dependency probe diagnostics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("MAINPOT_CANARY_KEY", "test-canary-key-".padEnd(40, "x"));
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
    Object.assign(state, { subscribed: true, deliver: true, deleteError: false, insertError: false, inserted: "", deleted: [], change: undefined });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  it("returns healthy only after matching change delivery and scoped cleanup", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: true, realtime: true, subscription: true, cleanup: true });
    expect(state.deleted).toEqual([state.inserted]);
  });
  it("distinguishes a subscription timeout from failed change delivery", async () => {
    state.subscribed = false; state.deliver = false;
    const response = POST(request());
    await vi.advanceTimersByTimeAsync(3001);
    expect(await (await response).json()).toEqual({ status: "degraded", database: true, realtime: false, subscription: false, cleanup: true });
    expect(state.deleted).toEqual([state.inserted]);
  });
  it("reports delivery timeout while retaining successful subscription and cleanup", async () => {
    state.deliver = false;
    const response = POST(request());
    await vi.advanceTimersByTimeAsync(3001);
    expect(await (await response).json()).toEqual({ status: "degraded", database: true, realtime: false, subscription: true, cleanup: true });
  });
  it("cleans only its probe after a lost insert acknowledgment", async () => {
    state.insertError = true;
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(state.deleted).toEqual([state.inserted]);
  });
  it("reports failed cleanup and retries only the generated probe row", async () => {
    state.deleteError = true;
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ cleanup: false, realtime: true, status: "degraded" });
    expect(state.deleted).toEqual([state.inserted, state.inserted]);
  });
});
