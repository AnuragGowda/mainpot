import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import { failureDiagnostics } from "../tests/e2e/failure-diagnostics";
function setup() {
  const events = new Map<string, ((...args: unknown[]) => void)[]>();
  const frame = {};
  let identifyDocument: ((source: { frame: unknown }, document: number) => void) | undefined;
  const page = {
    addInitScript: vi.fn(async () => {}),
    exposeBinding: vi.fn(async (_name: string, callback: typeof identifyDocument) => { identifyDocument = callback; }),
    mainFrame: () => frame,
    on: (name: string, cb: (...args: unknown[]) => void) => events.set(name, [...(events.get(name) ?? []), cb]),
  } as unknown as Page;
  const emit = (name: string, value: unknown) => events.get(name)?.forEach(cb => cb(value));
  const request = (method = "GET", path = "/auth/v1/user", resource = "fetch", requestFrame = frame) => ({ url: () => `http://127.0.0.1:55321${path}`, failure: () => ({ errorText: "net::ERR_ABORTED" }), method: () => method, resourceType: () => resource, frame: () => requestFrame });
  const documentStarted = (document: number) => {
    identifyDocument?.({ frame }, document);
    emit("console", { text: () => `[read-lifecycle] ${JSON.stringify({ event: "document-started", document })}` });
  };
  return { page, emit, request, frame, documentStarted, diagnostics: failureDiagnostics([page]) };
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

it("retires a lost old-document lookup only after a different document initializes", async () => {
  const { page, emit, request, documentStarted, diagnostics: d } = setup();
  documentStarted(10);
  emit("request", request("POST", "/rest/v1/rpc/get_game_by_code"));
  documentStarted(20);
  const action = vi.fn(async () => {});
  const pending = d.navigate(page, "next navigation", action);
  await vi.advanceTimersByTimeAsync(250); await pending;
  expect(action).toHaveBeenCalledOnce();
  expect(d.report().retiredReads).toMatchObject([{ fromDocument: 10, toDocument: 20, path: "/rest/v1/rpc/get_game_by_code" }]);
});

it("keeps reads tracked across same-document frame navigation", async () => {
  const { page, emit, request, frame, documentStarted, diagnostics: d } = setup();
  documentStarted(10);
  const req = request(); emit("request", req);
  emit("framenavigated", frame);
  const action = vi.fn(async () => {});
  const pending = d.navigate(page, "reload", action);
  await vi.advanceTimersByTimeAsync(250);
  expect(action).not.toHaveBeenCalled();
  expect(d.report().retiredReads).toEqual([]);
  emit("requestfinished", req);
  await vi.advanceTimersByTimeAsync(250); await pending;
});

it("retains financial writes and current-document reads after replacement", async () => {
  const { page, emit, request, documentStarted, diagnostics: d } = setup();
  documentStarted(10);
  const write = request("POST", "/rest/v1/rpc/set_settlement_payment_status_guarded");
  emit("request", write);
  documentStarted(20);
  const read = request(); emit("request", read);
  const action = vi.fn(async () => {});
  const pending = d.navigate(page, "reload", action);
  emit("requestfinished", read);
  await vi.advanceTimersByTimeAsync(250);
  expect(action).not.toHaveBeenCalled();
  expect(d.report().retiredReads).toEqual([]);
  emit("requestfinished", write);
  await vi.advanceTimersByTimeAsync(250); await pending;
});

it("retains reads with unknown document identity", async () => {
  const { page, emit, request, documentStarted, diagnostics: d } = setup();
  const req = request(); emit("request", req);
  documentStarted(10); documentStarted(20);
  const action = vi.fn(async () => {});
  const pending = d.navigate(page, "reload", action);
  await vi.advanceTimersByTimeAsync(250);
  expect(action).not.toHaveBeenCalled();
  expect(d.report().retiredReads).toEqual([]);
  emit("requestfinished", req);
  await vi.advanceTimersByTimeAsync(250); await pending;
});

it.each(["xhr", "child-frame"])("retains %s reads that are not gated by the main-document fetch handshake", async (kind) => {
  const { page, emit, request, frame, documentStarted, diagnostics: d } = setup();
  documentStarted(10);
  const req = request("GET", "/auth/v1/user", kind === "xhr" ? "xhr" : "fetch", kind === "child-frame" ? {} : frame);
  emit("request", req);
  documentStarted(20);
  const action = vi.fn(async () => {});
  const pending = d.navigate(page, "reload", action);
  await vi.advanceTimersByTimeAsync(250);
  expect(action).not.toHaveBeenCalled();
  expect(d.report().retiredReads).toEqual([]);
  emit("requestfinished", req);
  await vi.advanceTimersByTimeAsync(250); await pending;
});
