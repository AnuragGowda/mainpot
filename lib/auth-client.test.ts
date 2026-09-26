import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getUser: vi.fn(), signInAnonymously: vi.fn() }));
vi.mock("./supabase-browser", () => ({ getBrowserSupabase: () => ({ auth }) }));
import { ensureCurrentUser } from "./auth-client";

describe("secure session recovery", () => {
  beforeEach(() => vi.resetAllMocks());
  it("preserves the existing authenticated identity", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "existing" } }, error: null });
    expect(await ensureCurrentUser()).toEqual({ id: "existing" });
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });
  it("starts a guest identity only when there is no session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
    auth.signInAnonymously.mockResolvedValue({ data: { user: { id: "guest" } }, error: null });
    expect(await ensureCurrentUser()).toEqual({ id: "guest" });
    expect(auth.signInAnonymously).toHaveBeenCalledOnce();
  });
  it("does not replace an identity when auth verification fails", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthRetryableFetchError", message: "Network unavailable" } });
    await expect(ensureCurrentUser()).rejects.toThrow("Could not check your secure session");
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });
});
