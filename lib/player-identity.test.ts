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
  it("does not impersonate a prior account after anonymous auth rotation", () => {
    expect(resolveCurrentPlayer(players, "guest-browser", "rotated")).toBeNull();
  });
  it("never matches a host-managed null identity or an unrelated visitor", () => {
    expect(resolveCurrentPlayer(players, null, null)).toBeNull();
    expect(resolveCurrentPlayer(players, "new", "outsider")).toBeNull();
  });
  it("uses a browser identity only for a local seat without an account owner", () => {
    const local = [{ id: "local", user_id: null, session_id: "local-browser" }];
    expect(resolveCurrentPlayer(local, "local-browser", null)?.id).toBe("local");
    expect(resolveCurrentPlayer(players, "original-browser", null)).toBeNull();
  });

});
