import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithFutureJwtRetry } from "./supabase-fetch";
const endpoint = "https://example.test/rest/v1/rpc/create_game_idempotent";
const rejection = () => new Response(JSON.stringify({ code: "PGRST303", message: "JWT issued at future" }), { status: 401 });

describe("temporary JWT rejection", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("replays the exact rejected write once and preserves its operation body", async () => {
    const mock = vi.fn().mockResolvedValueOnce(rejection()).mockResolvedValueOnce(new Response("ok"));
    vi.stubGlobal("fetch", mock);
    const init = { method: "POST", body: JSON.stringify({ input_operation_key: "same-key" }) };
    const response = fetchWithFutureJwtRetry(endpoint, init);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await (await response).text()).toBe("ok");
    expect(mock.mock.calls).toEqual([[endpoint, init], [endpoint, init]]);
  });
  it("does not loop when the auth rejection persists", async () => {
    const mock = vi.fn().mockImplementation(async () => rejection());
    vi.stubGlobal("fetch", mock);
    const response = fetchWithFutureJwtRetry(endpoint);
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await response).status).toBe(401);
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it.each([401, 500])("does not replay other %s errors or unknown outcomes", async status => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "other", message: "Failure" }), { status }));
    vi.stubGlobal("fetch", mock);
    await fetchWithFutureJwtRetry(endpoint);
    expect(mock).toHaveBeenCalledOnce();
  });
  it("keeps cancellation effective while waiting for the retry", async () => {
    const mock = vi.fn().mockResolvedValue(rejection());
    vi.stubGlobal("fetch", mock);
    const controller = new AbortController();
    const response = fetchWithFutureJwtRetry(endpoint, { signal: controller.signal });
    const check = expect(response).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await check;
    expect(mock).toHaveBeenCalledOnce();
  });
});
