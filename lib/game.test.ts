import { describe, expect, it } from "vitest";
import { pendingPot, playerPendingAmount, playerVerifiedInvested, verifiedPot } from "./game";
import type { GameSnapshot } from "./types";

const snapshot = {
  game: { id: "game-1" },
  players: [],
  cashOuts: [],
  events: [],
  buyIns: [
    { id: "buy-1", game_id: "game-1", player_id: "player-1", amount: 20, verified: true },
    { id: "buy-2", game_id: "game-1", player_id: "player-1", amount: 15, verified: false },
    { id: "buy-3", game_id: "game-1", player_id: "player-2", amount: 25, verified: true },
  ],
} as unknown as GameSnapshot;

describe("verified and pending pots", () => {
  it("keeps host-approved money separate from pending entries", () => {
    expect(verifiedPot(snapshot)).toBe(45);
    expect(pendingPot(snapshot)).toBe(15);
  });

  it("reports the same split for each player", () => {
    expect(playerVerifiedInvested(snapshot, "player-1")).toBe(20);
    expect(playerPendingAmount(snapshot, "player-1")).toBe(15);
  });
});
