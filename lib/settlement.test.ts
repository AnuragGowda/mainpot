import { describe, expect, it } from "vitest";
import {
  applyFundingAdjustments,
  applyDiscrepancyAllocation,
  calculateBankSettlement,
  calculateMinTransfers,
} from "./settlement";
import type { PlayerNet } from "./settlement";
import type { BuyIn } from "./types";

function player(playerId: string, net: number): PlayerNet {
  return { playerId, name: playerId, net };
}

describe("calculateMinTransfers", () => {
  it("settles a simple two-party debt", () => {
    const transfers = calculateMinTransfers([
      player("A", 30),
      player("B", -30),
    ]);
    expect(transfers).toEqual([{ from: "B", to: "A", amount: 30, fromPlayerId: "B", toPlayerId: "A" }]);
  });

  it("settles a three-party case with the total transfer amount and sorted amounts", () => {
    const transfers = calculateMinTransfers([
      player("A", 50),
      player("B", -30),
      player("C", -20),
    ]);
    const total = transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
    expect(total).toBe(50);
    expect(transfers).toEqual([
      { from: "B", to: "A", amount: 30, fromPlayerId: "B", toPlayerId: "A" },
      { from: "C", to: "A", amount: 20, fromPlayerId: "C", toPlayerId: "A" },
    ]);
    // Amounts are sorted descending.
    expect(transfers.map((transfer) => transfer.amount)).toEqual([30, 20]);
  });

  it("returns no transfers when all nets are ~0", () => {
    const transfers = calculateMinTransfers([
      player("A", 0.001),
      player("B", -0.001),
      player("C", 0),
    ]);
    expect(transfers).toEqual([]);
  });
});

describe("calculateBankSettlement", () => {
  it("excludes the bank player and pairs everyone else with the bank", () => {
    const transfers = calculateBankSettlement(
      [player("A", -30), player("B", 30), player("C", -15)],
      "A"
    );
    expect(transfers).toEqual([
      { from: "Bank", to: "B", amount: 30, fromPlayerId: "A", toPlayerId: "B" },
      { from: "C", to: "Bank", amount: 15, fromPlayerId: "C", toPlayerId: "A" },
    ]);
  });
});

describe("applyFundingAdjustments", () => {
  it("shifts a fronted buy-in into settlement without changing the player list", () => {
    const frontedBuyIn: BuyIn = {
      id: "buy-in-1",
      game_id: "game-1",
      player_id: "B",
      amount: 40,
      type: "rebuy",
      fronted_by_player_id: "A",
      verified: false,
      created_at: "2026-08-30T00:00:00.000Z",
    };

    expect(
      applyFundingAdjustments(
        [player("A", -20), player("B", 20)],
        [frontedBuyIn]
      )
    ).toEqual([player("A", 20), player("B", -20)]);
  });

  it("ignores ordinary buy-ins", () => {
    const ordinaryBuyIn: BuyIn = {
      id: "buy-in-2",
      game_id: "game-1",
      player_id: "A",
      amount: 40,
      type: "buy_in",
      fronted_by_player_id: null,
      verified: false,
      created_at: "2026-08-30T00:00:00.000Z",
    };

    expect(applyFundingAdjustments([player("A", 0)], [ordinaryBuyIn])).toEqual([
      player("A", 0),
    ]);
  });
});

describe("applyDiscrepancyAllocation", () => {
  it("reduces winnings proportionally when cash-outs exceed buy-ins", () => {
    expect(applyDiscrepancyAllocation(
      [player("A", 60), player("B", 40), player("C", -120)],
      -20,
      { method: "proportional", playerIds: [] }
    )).toEqual([player("A", 48), player("B", 32), player("C", -120)]);
  });

  it("uses only selected eligible players when they can cover the discrepancy", () => {
    expect(applyDiscrepancyAllocation(
      [player("A", 60), player("B", 40), player("C", -120)],
      -20,
      { method: "selected", playerIds: ["B"] }
    )).toEqual([player("A", 60), player("B", 20), player("C", -120)]);
  });
});
