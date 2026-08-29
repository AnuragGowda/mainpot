import { describe, expect, it } from "vitest";
import {
  calculateBankSettlement,
  calculateMinTransfers,
} from "./settlement";
import type { PlayerNet } from "./settlement";

function player(playerId: string, net: number): PlayerNet {
  return { playerId, name: playerId, net };
}

describe("calculateMinTransfers", () => {
  it("settles a simple two-party debt", () => {
    const transfers = calculateMinTransfers([
      player("A", 30),
      player("B", -30),
    ]);
    expect(transfers).toEqual([{ from: "B", to: "A", amount: 30 }]);
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
      { from: "B", to: "A", amount: 30 },
      { from: "C", to: "A", amount: 20 },
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
      { from: "Bank", to: "B", amount: 30 },
      { from: "C", to: "Bank", amount: 15 },
    ]);
  });
});