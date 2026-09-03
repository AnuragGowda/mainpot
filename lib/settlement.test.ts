import { describe, expect, it } from "vitest";
import {
  applyFundingAdjustments,
  applyDiscrepancyAllocation,
  calculateBankSettlement,
  calculateMinTransfers,
  getPlayerNetChanges,
  getPlayerTransfers,
  isPlayerInTransfer,
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

describe("player settlement views", () => {
  const transfers = [
    { from: "A", to: "B", amount: 30, fromPlayerId: "A", toPlayerId: "B" },
    { from: "C", to: "B", amount: 20, fromPlayerId: "C", toPlayerId: "B" },
    { from: "D", to: "E", amount: 10, fromPlayerId: "D", toPlayerId: "E" },
  ];

  it("prioritizes only a player's outgoing and incoming payments", () => {
    expect(getPlayerTransfers(transfers, "A")).toEqual({
      outgoing: [transfers[0]],
      incoming: [],
    });
    expect(getPlayerTransfers(transfers, "B")).toEqual({
      outgoing: [],
      incoming: [transfers[0], transfers[1]],
    });
  });

  it("recognizes only payers and recipients as parties to a payment", () => {
    expect(isPlayerInTransfer(transfers[0], "A")).toBe(true);
    expect(isPlayerInTransfer(transfers[0], "B")).toBe(true);
    expect(isPlayerInTransfer(transfers[0], "C")).toBe(false);
    expect(isPlayerInTransfer(transfers[0], null)).toBe(false);
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

describe("getPlayerNetChanges", () => {
  it("describes each player's before, adjustment, and final result", () => {
    expect(getPlayerNetChanges(
      [player("A", 40), player("B", -30)],
      [player("A", 30), player("B", -30)]
    )).toEqual([
      { playerId: "A", name: "A", before: 40, adjustment: -10, final: 30 },
      { playerId: "B", name: "B", before: -30, adjustment: 0, final: -30 },
    ]);
  });
});

describe("applyDiscrepancyAllocation", () => {
  it("reduces winnings proportionally when cash-outs exceed buy-ins", () => {
    expect(applyDiscrepancyAllocation(
      [player("A", 60), player("B", 40), player("C", -80)],
      -20,
      { method: "proportional", playerIds: [] }
    )).toEqual([player("A", 48), player("B", 32), player("C", -80)]);
  });

  it("uses only selected eligible players when they can cover the discrepancy", () => {
    expect(applyDiscrepancyAllocation(
      [player("A", 60), player("B", 40), player("C", -80)],
      -20,
      { method: "selected", playerIds: ["B"] }
    )).toEqual([player("A", 60), player("B", 20), player("C", -80)]);
  });

  it("uses exact custom amounts without changing the opposite side", () => {
    expect(applyDiscrepancyAllocation(
      [player("A", 60), player("B", 40), player("C", -80)],
      -20,
      {
        method: "custom",
        playerIds: ["A", "B"],
        playerAllocations: [
          { playerId: "A", amount: 15 },
          { playerId: "B", amount: 5 },
        ],
      }
    )).toEqual([player("A", 45), player("B", 35), player("C", -80)]);
  });

  it("rejects a custom allocation that does not total the discrepancy", () => {
    const players = [player("A", 60), player("B", 40), player("C", -80)];
    expect(applyDiscrepancyAllocation(players, -20, {
      method: "custom",
      playerIds: ["A"],
      playerAllocations: [{ playerId: "A", amount: 19 }],
    })).toBe(players);
  });

  it("rejects a custom amount that would push a result through zero", () => {
    const players = [player("A", 10), player("B", -30)];
    expect(applyDiscrepancyAllocation(players, -20, {
      method: "custom",
      playerIds: ["A"],
      playerAllocations: [{ playerId: "A", amount: 20 }],
    })).toBe(players);
  });
});
