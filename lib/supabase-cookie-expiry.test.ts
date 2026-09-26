import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { ResponseCookies } from "next/dist/compiled/@edge-runtime/cookies";
import type { CookieOptions } from "@supabase/ssr";

type CookieChange = { name: string; value: string; options: CookieOptions };
const mocks = vi.hoisted(() => ({ setAll: undefined as ((changes: CookieChange[]) => void) | undefined, cookieSet: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: mocks.cookieSet }) }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (changes: CookieChange[]) => void } }) => {
    mocks.setAll = options.cookies.setAll;
    return { auth: { getUser: async () => {
      mocks.setAll?.([{ name: "sb-test-auth-token", value: "", options: { path: "/", maxAge: 0 } }]);
      return { data: { user: null }, error: null };
    } } };
  },
}));

function expectDeletionSurvivesMerge(response: NextResponse) {
  // Next reparses response cookies when merging cookies() changes. Test that
  // exact round trip rather than only inspecting the pre-merge maxAge option.
  const reparsed = new ResponseCookies(response.headers).get("sb-test-auth-token");
  expect(reparsed?.expires).toEqual(new Date(0));
}

describe("Supabase cookie deletion", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:55321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-publishable-key");
    mocks.cookieSet.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("expires stale sessions after Route Handler cookie merging", async () => {
    const { createServerSupabase } = await import("./supabase-server");
    const response = NextResponse.redirect("http://localhost/dashboard");
    await createServerSupabase(changes => changes.forEach(({ name, value, options }) => response.cookies.set(name, value, options)));
    mocks.setAll?.([{ name: "sb-test-auth-token", value: "", options: { path: "/", maxAge: 0 } }]);
    expectDeletionSurvivesMerge(response);
  });

  it("expires sessions cleared during proxy refresh", async () => {
    const { updateSession } = await import("../proxy");
    expectDeletionSurvivesMerge(await updateSession(new NextRequest("http://localhost/dashboard")));
  });
});
