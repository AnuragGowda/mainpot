vi.mock("@/lib/request-origin", async () => import("./request-origin"));
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createServerSupabase: vi.fn(), pushIsConfigured: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ createServerSupabase: mocks.createServerSupabase }));
vi.mock("@/lib/push-server", () => ({ pushIsConfigured: mocks.pushIsConfigured }));
vi.mock("@/lib/push-endpoint", async () => import("./push-endpoint"));
import { POST } from "../app/api/push/subscriptions/route";

function request(endpoint: string, host?: string, origin = "https://mainpot.app") {
  return new Request(host ? "http://localhost:3110/api/push/subscriptions" : "https://mainpot.app/api/push/subscriptions", {
    method: "POST", headers: { "content-type": "application/json", origin, ...(host ? { host } : {}) },
    body: JSON.stringify({ endpoint, keys: { p256dh: "validPushKey", auth: "validAuthKey" } }),
  });
}

describe("push subscription registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pushIsConfigured.mockReturnValue(true);
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.createServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-id" } }, error: null }) },
      from: vi.fn().mockReturnValue({ upsert: mocks.upsert }),
    });
  });

  it("rejects arbitrary HTTPS endpoints before saving the subscription", async () => {
    const response = await POST(request("https://internal.example/private"));
    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("saves a browser push service endpoint", async () => {
    const response = await POST(request("https://fcm.googleapis.com/fcm/send/device"));
    expect(response.status).toBe(204);
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });
  it("accepts the actual host despite an internal request hostname", async () => {
    expect((await POST(request("https://fcm.googleapis.com/fcm/send/device", "127.0.0.1:3110", "http://127.0.0.1:3110"))).status).toBe(204);
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it.each(["http://evil.example", "http://localhost:3110"])("rejects an unrelated origin %s", async origin => {
    expect((await POST(request("https://fcm.googleapis.com/fcm/send/device", "127.0.0.1:3110", origin))).status).toBe(403);
    expect(mocks.createServerSupabase).not.toHaveBeenCalled();
  });

});
