import { afterEach, expect, it, vi } from "vitest";
import { withTimeout } from "./request-timeout";

afterEach(() => vi.useRealTimers());

it("releases a stalled read with a recoverable error", async () => {
  vi.useFakeTimers();
  const result = withTimeout(new Promise(() => {}), "Retry your connection", 100);
  const rejected = expect(result).rejects.toThrow("Retry your connection");
  await vi.advanceTimersByTimeAsync(100);
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
});

it("clears its deadline after success or immediate failure", async () => {
  vi.useFakeTimers();
  await expect(withTimeout(Promise.resolve("loaded"), "Timeout")).resolves.toBe("loaded");
  await expect(withTimeout(Promise.reject(new Error("Offline")), "Timeout")).rejects.toThrow("Offline");
  expect(vi.getTimerCount()).toBe(0);
});
