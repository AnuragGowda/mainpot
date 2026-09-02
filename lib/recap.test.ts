import { describe, expect, it } from "vitest";
import {
  defaultRecapPrivacy,
  deriveRecapData,
  getRecapDisplayPlayers,
} from "./recap";
import type { GameSnapshot } from "./types";

const snapshot: GameSnapshot = {
  game: {
    id: "game-1", code: "ABC123", name: "Friday Deep Stack", host_user_id: null,
    host_session_id: "host", host_name: "Alex", buy_in_amount: 20, status: "ended",
    host_is_anonymous: true, expires_at: null, created_at: "2026-08-20T18:00:00.000Z",
    ended_at: "2026-08-20T22:30:00.000Z", acquisition_source: null,
  },
  players: [
    { id: "a", game_id: "game-1", session_id: "a", user_id: null, name: "Alex", is_host: true, joined_at: "2026-08-20T18:00:00.000Z", left_at: null },
    { id: "b", game_id: "game-1", session_id: "b", user_id: null, name: "Bea", is_host: false, joined_at: "2026-08-20T18:00:00.000Z", left_at: null },
    { id: "c", game_id: "game-1", session_id: "c", user_id: null, name: "Cam", is_host: false, joined_at: "2026-08-20T18:00:00.000Z", left_at: null },
  ],
  buyIns: [
    { id: "1", game_id: "game-1", player_id: "a", amount: 20, type: "buy_in", fronted_by_player_id: null, verified: true, created_at: "2026-08-20T18:00:00.000Z" },
    { id: "2", game_id: "game-1", player_id: "b", amount: 20, type: "buy_in", fronted_by_player_id: null, verified: true, created_at: "2026-08-20T18:00:00.000Z" },
    { id: "3", game_id: "game-1", player_id: "c", amount: 20, type: "buy_in", fronted_by_player_id: null, verified: true, created_at: "2026-08-20T18:00:00.000Z" },
    { id: "4", game_id: "game-1", player_id: "b", amount: 20, type: "rebuy", fronted_by_player_id: null, verified: true, created_at: "2026-08-20T19:00:00.000Z" },
  ],
  cashOuts: [], events: [],
};

describe("deriveRecapData", () => {
  it("derives finished-game details from canonical data and settlement output", () => {
    const recap = deriveRecapData(snapshot, [
      { playerId: "a", name: "Alex", net: 40 },
      { playerId: "b", name: "Bea", net: -10 },
      { playerId: "c", name: "Cam", net: -30 },
    ], [{ from: "Cam", to: "Alex", amount: 30, fromPlayerId: "c", toPlayerId: "a" }]);

    expect(recap).toMatchObject({
      gameId: "game-1", playerCount: 3, durationMinutes: 270, totalBuyIn: 80,
      rebuyCount: 1, settlementPaymentCount: 1,
    });
    expect(recap.players.map((player) => [player.displayName, player.rank, player.rebuyCount]))
      .toEqual([["Alex", 1, 0], ["Bea", 2, 1], ["Cam", 3, 0]]);
  });
});

describe("getRecapDisplayPlayers", () => {
  const recap = deriveRecapData(snapshot, [
    { playerId: "a", name: "Alex", net: 40 },
    { playerId: "b", name: "Bea", net: -10 },
    { playerId: "c", name: "Cam", net: -30 },
  ], []);

  it("shows anonymous player results and amounts by default", () => {
    expect(getRecapDisplayPlayers(recap, defaultRecapPrivacy)).toEqual([
      expect.objectContaining({ id: "a", displayLabel: "Player 1", showNet: true }),
      expect.objectContaining({ id: "b", displayLabel: "Player 2", showNet: true }),
      expect.objectContaining({ id: "c", displayLabel: "Player 3", showNet: true }),
    ]);
  });

  it("keeps privacy preferences separate while allowing an explicit full display", () => {
    const displayed = getRecapDisplayPlayers(recap, {
      showDollarAmounts: true, showPlayerNames: true, showLosses: true, hiddenPlayerIds: ["b"],
    });
    expect(displayed.map((player) => [player.displayLabel, player.showNet])).toEqual([
      ["Alex", true], ["Cam", true],
    ]);
    expect(recap.players).toHaveLength(3);
  });
});
