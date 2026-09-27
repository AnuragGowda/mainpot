import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { subscribeWithPollingFallback } from "./realtime-subscription";

afterEach(() => vi.restoreAllMocks());

function fakeClient() {
  const topics = new Map<string, { topic: string }>();
  const client = {
    channel: vi.fn((topic: string) => {
      if (!topics.has(topic)) topics.set(topic, { topic });
      return topics.get(topic)!;
    }),
    removeChannel: vi.fn(async () => "ok"),
  };
  return { client, supabase: client as unknown as SupabaseClient };
}

describe("realtime as an optional polling optimization", () => {
  it("isolates simultaneous readers and a restarted reader while cleanup is pending", () => {
    const supabase = createClient("https://example.test", "test-public-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    // Exercise the installed library's actual channel deduplication contract.
    expect(supabase.channel("same-topic")).toBe(supabase.channel("same-topic"));
    const remove = vi.spyOn(supabase, "removeChannel").mockImplementation(() => new Promise(() => {}));
    const channels: unknown[] = [];
    const configure = (channel: unknown) => channels.push(channel);
    const stopFirst = subscribeWithPollingFallback(supabase, "payments-game", configure);
    subscribeWithPollingFallback(supabase, "payments-game", configure);
    stopFirst();
    subscribeWithPollingFallback(supabase, "payments-game", configure);
    expect(new Set(channels).size).toBe(3);
    stopFirst();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("contains setup errors so the caller can keep its polling reader running", () => {
    const { client, supabase } = fakeClient();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const failed = vi.fn();
    const stop = subscribeWithPollingFallback(supabase, "payments-game", () => {
      throw new Error("cannot add postgres_changes callbacks after subscribe()");
    }, failed);
    expect(failed).toHaveBeenCalledOnce();
    expect(client.removeChannel).toHaveBeenCalledOnce();
    expect(() => stop()).not.toThrow();
    expect(client.removeChannel).toHaveBeenCalledOnce();
  });

  it("contains errors while allocating a channel", () => {
    const { client, supabase } = fakeClient();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    client.channel.mockImplementation(() => { throw new Error("transport unavailable"); });
    const configure = vi.fn();
    const failed = vi.fn();
    expect(() => subscribeWithPollingFallback(supabase, "game", configure, failed)).not.toThrow();
    expect(configure).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledOnce();
  });

  it("does not turn failed async cleanup into an unhandled rejection", async () => {
    const { client, supabase } = fakeClient();
    client.removeChannel.mockRejectedValue(new Error("transport closed"));
    const stop = subscribeWithPollingFallback(supabase, "game", () => {});
    expect(() => stop()).not.toThrow();
    await Promise.resolve();
  });
});
