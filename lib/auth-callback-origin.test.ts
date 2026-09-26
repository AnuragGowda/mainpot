import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/request-timeout", async () => import("./request-timeout"));
vi.mock("@/lib/account-transfer", async () => import("./account-transfer"));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/supabase-server", () => ({ createServerSupabase: mocks.createServerSupabase }));
import { GET } from "../app/auth/callback/route";

function request(query: string) {
  return new Request(`http://localhost:3110/auth/callback?${query}`, { headers: { host: "127.0.0.1:3110" } });
}

describe("authentication callback origin", () => {
  beforeEach(() => mocks.createServerSupabase.mockResolvedValue({
    auth: { exchangeCodeForSession: async () => ({ error: null }) },
  }));

  it("keeps the browser's host when Next reports an internal hostname", async () => {
    const response = await GET(request("code=test-code&next=%2Fdashboard"));
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3110/dashboard");
  });

  it("keeps failed callbacks on the browser's host", async () => {
    const response = await GET(request("next=%2Fdashboard"));
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3110/signin?error=missing_code");
  });

  it("rejects a next URL outside the browser's origin", async () => {
    const response = await GET(request("code=test-code&next=https%3A%2F%2Fexample.com"));
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3110/");
  });
});
