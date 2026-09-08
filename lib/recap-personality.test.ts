import { describe, expect, it } from "vitest";
import { getRecapPersona, getShareableRecapCaption, recapOutcomeForPlayer, recapPersonaCount } from "./recap-personality";
import { defaultRecapPrivacy, type RecapData } from "./recap";

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

describe("getShareableRecapCaption", () => {
  it("keeps real names off the social card even when legacy name display is enabled", () => {
    const caption = getShareableRecapCaption(data, "a", 0, { ...defaultRecapPrivacy, showPlayerNames: true });
    expect(caption.title).toBe("Mayor of Value Town");
    expect(JSON.stringify(caption)).not.toContain("Alex");
    expect(JSON.stringify(caption)).not.toContain(data.gameName);
  });

  it.each([
    { showDollarAmounts: false },
    { showResult: false },
    { showLosses: false },
    { hiddenPlayerIds: ["e"] },
  ])("does not reveal a hidden loss through the joke: %j", (privacy) => {
    const caption = getShareableRecapCaption(data, "e", 0, { ...defaultRecapPrivacy, ...privacy });
    expect(caption.title).toBe("The Table Celebrity");
  });

  it("uses a neutral joke with no players and keeps the selected variant stable", () => {
    expect(getShareableRecapCaption({ ...data, players: [] }, undefined, 1, defaultRecapPrivacy).title)
      .toBe("The Poker Face");
    expect(getShareableRecapCaption(data, "a", 1, defaultRecapPrivacy))
      .toEqual(getShareableRecapCaption(data, "a", 11, defaultRecapPrivacy));
  });
});
