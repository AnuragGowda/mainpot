import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import { failureDiagnostics } from "../tests/e2e/failure-diagnostics";
function setup() {
  const events = new Map<string, ((...args: unknown[]) => void)[]>();
  const page = { on: (name: string, cb: (...args: unknown[]) => void) => events.set(name, [...(events.get(name) ?? []), cb]) } as unknown as Page;
  const emit = (name: string, value: unknown) => events.get(name)?.forEach(cb => cb(value));
  const request = () => ({ url: () => "http://127.0.0.1:55321/auth/v1/user", failure: () => ({ errorText: "net::ERR_ABORTED" }), method: () => "GET", resourceType: () => "fetch" });
  return { page, emit, request, diagnostics: failureDiagnostics([page]) };
}
beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }));
afterEach(() => vi.useRealTimers());
it("waits for a browser request to complete and then 250 ms without activity", async () => {
  const { page, emit, request, diagnostics: d } = setup(); const req = request(); const action = vi.fn(async () => {});
  emit("request", req); const pending = d.navigate(page, "reload", action);
  await vi.advanceTimersByTimeAsync(1000); expect(action).not.toHaveBeenCalled();
  emit("requestfinished", req); await vi.advanceTimersByTimeAsync(249); expect(action).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); await pending; expect(action).toHaveBeenCalledOnce();
  expect(d.report().transitions.find(x => x.event === "read-quiescent")).toMatchObject({ activeRequests: 0, activeHandlers: 0, quietFor: 250 });
});
it("also waits for the route handler after browser request completion", async () => {
  const { page, emit, request, diagnostics: d } = setup(); const req = request(); const action = vi.fn(async () => {});
  let release!: () => void;
  emit("request", req); const handler = d.duringRoute(page, () => new Promise<void>(resolve => { release = resolve; }));
  emit("requestfinished", req); const pending = d.navigate(page, "reload", action);
  await vi.advanceTimersByTimeAsync(1000); expect(action).not.toHaveBeenCalled();
  release(); await handler; await vi.advanceTimersByTimeAsync(249); expect(action).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); await pending; expect(action).toHaveBeenCalledOnce();
});
it("restarts the quiet window when another browser read starts and finishes", async () => {
  const { page, emit, request, diagnostics: d } = setup(); const action = vi.fn(async () => {});
  const pending = d.navigate(page, "reload", action); await vi.advanceTimersByTimeAsync(200);
  const req = request(); emit("request", req); emit("requestfinished", req);
  await vi.advanceTimersByTimeAsync(249); expect(action).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); await pending; expect(action).toHaveBeenCalledOnce();
});
it("releases failed browser reads without discarding their diagnostics", async () => {
  const { page, emit, request, diagnostics: d } = setup(); const req = request(); const action = vi.fn(async () => {});
  emit("request", req); const pending = d.navigate(page, "reload", action); emit("requestfailed", req);
  await vi.advanceTimersByTimeAsync(250); await pending;
  expect(d.report().failedRequests).toHaveLength(1); expect(action).toHaveBeenCalledOnce();
});
it("fails within 15 seconds when work cannot become quiet, without navigating", async () => {
  const { page, emit, request, diagnostics: d } = setup(); const action = vi.fn(async () => {});
  emit("request", request()); const pending = d.navigate(page, "reload", action);
  const assertion = expect(pending).rejects.toThrow("Read quiescence not reached within 15 seconds: 1 browser requests, 0 route handlers.");
  await vi.advanceTimersByTimeAsync(15000); await assertion; expect(action).not.toHaveBeenCalled();
});
