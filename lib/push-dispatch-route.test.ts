import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/request-origin", async () => import("./request-origin"));
vi.mock("@/lib/supabase-server", () => ({ createServerSupabase: mocks.createServerSupabase }));
vi.mock("@/lib/push-server", () => ({ pushIsConfigured: () => true, getPushAdminClient: () => ({}), sendWebPush: vi.fn() }));
vi.mock("@/lib/push-recipients", () => ({ getPushRecipientIds: vi.fn() }));
import { POST } from "../app/api/push/dispatch/route";

function request(origin: string, host = "127.0.0.1:3110") {
  return new Request("http://localhost:3110/api/push/dispatch", {
    method: "POST", headers: { host, origin, "content-type": "application/json" }, body: "{}",
  });
}

describe("push dispatch origin", () => {
  beforeEach(() => {
    mocks.createServerSupabase.mockClear();
    mocks.createServerSupabase.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "user-id" } }, error: null }) } });
  });

  it("accepts the actual host and proceeds to authenticated body validation", async () => {
    expect((await POST(request("http://127.0.0.1:3110"))).status).toBe(400);
    expect(mocks.createServerSupabase).toHaveBeenCalledOnce();
  });

  it.each(["http://localhost:3110", "http://evil.example"])("rejects unrelated origin %s before authentication", async origin => {
    expect((await POST(request(origin))).status).toBe(403);
    expect(mocks.createServerSupabase).not.toHaveBeenCalled();
  });

  it("rejects malformed Host headers", async () => {
    expect((await POST(request("http://127.0.0.1:3110", "user@evil.example"))).status).toBe(403);
    expect(mocks.createServerSupabase).not.toHaveBeenCalled();
  });
});
