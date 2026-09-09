import { describe, expect, it } from "vitest";
import { resolveCurrentPlayer } from "./player-identity";

const players = [
  { id: "host", user_id: "account", session_id: "original-browser" },
  { id: "guest", user_id: "anonymous", session_id: "guest-browser" },
  { id: "managed", user_id: null, session_id: null },
];

describe("player identity recovery", () => {
  it("restores the same account seat in another browser", () => {
    expect(resolveCurrentPlayer(players, "new-browser", "account")?.id).toBe("host");
  });
  it("prioritizes an existing account seat over another browser seat", () => {
    expect(resolveCurrentPlayer(players, "guest-browser", "account")?.id).toBe("host");
  });
  it("recovers the guest seat after anonymous auth rotation", () => {
    expect(resolveCurrentPlayer(players, "guest-browser", "rotated")?.id).toBe("guest");
  });
  it("never matches a host-managed null identity or an unrelated visitor", () => {
    expect(resolveCurrentPlayer(players, null, null)).toBeNull();
    expect(resolveCurrentPlayer(players, "new", "outsider")).toBeNull();
  });
});
