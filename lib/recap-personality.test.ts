import { describe, expect, it } from "vitest";
import { getRecapPersona, recapOutcomeForPlayer, recapPersonaCount } from "./recap-personality";
import type { RecapData } from "./recap";

const data: RecapData = {
  gameId: "game-1",
  gameName: "Friday Night",
  playedAt: "2026-09-01T03:00:00.000Z",
  playerCount: 5,
  totalBuyIn: 200,
  rebuyCount: 2,
  settlementPaymentCount: 3,
  highlights: [],
  players: [
    { id: "a", displayName: "Alex Rivers", net: 60, rank: 1, rebuyCount: 0 },
    { id: "b", displayName: "Bea", net: 15, rank: 2, rebuyCount: 0 },
    { id: "c", displayName: "Cam", net: 0, rank: 3, rebuyCount: 0 },
    { id: "d", displayName: "Dana", net: -20, rank: 4, rebuyCount: 1 },
    { id: "e", displayName: "Eli", net: -55, rank: 5, rebuyCount: 1 },
  ],
};

describe("recapOutcomeForPlayer", () => {
  it("classifies the table extremes, ordinary results, and break-even players", () => {
    expect(data.players.map((player) => recapOutcomeForPlayer(data, player)))
      .toEqual(["big_win", "win", "even", "loss", "big_loss"]);
  });
});

describe("getRecapPersona", () => {
  it("keeps names private until explicitly enabled", () => {
    expect(getRecapPersona(data, "a", 0, false).title).toBe("Mayor of Value Town");
    expect(getRecapPersona(data, "a", 0, true).title).toBe("Alex of Value Town");
  });

  it("cycles safely through a large phrase pool", () => {
    const outcome = recapOutcomeForPlayer(data, data.players[0]);
    expect(recapPersonaCount(outcome)).toBeGreaterThanOrEqual(10);
    expect(getRecapPersona(data, "a", 10, false))
      .toEqual(getRecapPersona(data, "a", 0, false));
  });
});
