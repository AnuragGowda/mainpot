import { afterEach, expect, it, vi } from "vitest";
import { subscribeToGame } from "./data";

const mocks = vi.hoisted(() => ({
  client: {},
  authenticate: vi.fn(() => new Promise<never>(() => {})),
  callbacks: [] as (() => void)[],
  subscribed: undefined as ((status: string) => void) | undefined,
}));
vi.mock("./supabase", () => ({ isSupabaseConfigured: true }));
vi.mock("./supabase-browser", () => ({ getBrowserSupabase: () => mocks.client }));
vi.mock("./auth-client", () => ({ ensureCurrentUser: mocks.authenticate }));
vi.mock("./realtime-subscription", () => ({
  subscribeWithPollingFallback: (_client: unknown, _topic: string, configure: (channel: unknown) => void) => {
    const channel = {
      on: (_event: string, _filter: unknown, callback: () => void) => {
        mocks.callbacks.push(callback);
        return channel;
      },
      subscribe: (callback: (status: string) => void) => { mocks.subscribed = callback; },
    };
    configure(channel);
    return vi.fn();
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
  mocks.callbacks.length = 0;
});

it("does not start auth or snapshot reads from late callbacks after unsubscribe", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("window", {
    setInterval, clearInterval, setTimeout, clearTimeout,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  });
  const onSnapshot = vi.fn();
  const unsubscribe = subscribeToGame("game-id", onSnapshot);
  expect(mocks.callbacks.length).toBeGreaterThan(0);
  unsubscribe();
  for (const callback of mocks.callbacks) callback();
  mocks.subscribed?.("SUBSCRIBED");
  await vi.advanceTimersByTimeAsync(2_000);
  expect(mocks.authenticate).not.toHaveBeenCalled();
  expect(onSnapshot).not.toHaveBeenCalled();
  // An active subscription still starts its authoritative reconciliation.
  const active = subscribeToGame("active-game", onSnapshot);
  mocks.subscribed?.("SUBSCRIBED");
  expect(mocks.authenticate).toHaveBeenCalledOnce();
  active();
});
