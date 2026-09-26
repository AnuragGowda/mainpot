import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createServerSupabase: vi.fn(), pushIsConfigured: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ createServerSupabase: mocks.createServerSupabase }));
vi.mock("@/lib/push-server", () => ({ pushIsConfigured: mocks.pushIsConfigured }));
vi.mock("@/lib/push-endpoint", async () => import("./push-endpoint"));
import { POST } from "../app/api/push/subscriptions/route";

function request(endpoint: string) {
  return new Request("https://mainpot.app/api/push/subscriptions", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://mainpot.app" },
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
});
