import { describe, expect, it } from "vitest";
import {
  applyFundingAdjustments,
  applyDiscrepancyAllocation,
  calculateBankSettlement,
  calculateMinTransfers,
  getPlayerNetChanges,
  getPlayerPaymentTransfers,
  getPlayerTransfers,
  calculateEarlyCashOutNet,
  getEarlyCashOutTransfer,
  getPlayerFundingAdjustment,
  isPlayerInTransfer,
  rollForwardEarlyCashOuts,
} from "./settlement";
import type { PlayerNet } from "./settlement";
import type { BuyIn, EarlyCashOut, Player } from "./types";

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

  it("allows a zero-net host observer to be the bank", () => {
    const transfers = calculateBankSettlement(
      [player("host", 0), player("A", -30), player("B", 30)],
      "host"
    );
    expect(transfers).toEqual([
      { from: "A", to: "Bank", amount: 30, fromPlayerId: "A", toPlayerId: "host" },
      { from: "Bank", to: "B", amount: 30, fromPlayerId: "host", toPlayerId: "B" },
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

  it("keeps final-plan and locked early-exit obligations distinct for a player", () => {
    const earlyExit = { transfer: transfers[0], mode: "early_exit" as const };
    const finalPlan = { transfer: transfers[0], mode: "min" as const };

    expect(getPlayerPaymentTransfers([earlyExit, finalPlan], "A")).toEqual({
      outgoing: [earlyExit, finalPlan],
      incoming: [],
    });
    expect(getPlayerPaymentTransfers([earlyExit, finalPlan], "B")).toEqual({
      outgoing: [],
      incoming: [earlyExit, finalPlan],
    });
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

describe("early cash-outs", () => {
  const players: Player[] = [
    { id: "host", game_id: "game-1", session_id: "host", user_id: null, name: "Alex", is_host: true, joined_at: "2026-09-08T00:00:00.000Z", left_at: null },
    { id: "guest", game_id: "game-1", session_id: "guest", user_id: null, name: "Bea", is_host: false, joined_at: "2026-09-08T00:01:00.000Z", left_at: null },
  ];
  const buyIns: BuyIn[] = [
    { id: "buy-1", game_id: "game-1", player_id: "guest", amount: 100, type: "buy_in", fronted_by_player_id: null, verified: true, created_at: "2026-09-08T00:01:00.000Z" },
    { id: "buy-2", game_id: "game-1", player_id: "host", amount: 20, type: "rebuy", fronted_by_player_id: "guest", verified: true, created_at: "2026-09-08T00:02:00.000Z" },
  ];
  const earlyCashOut: EarlyCashOut = {
    id: "exit-1", game_id: "game-1", player_id: "guest", bank_player_id: "host",
    cash_out_amount: 120, verified_buy_in_amount: 100, funding_adjustment: 20,
    net_amount: 40, status: "locked", requested_at: "2026-09-08T01:00:00.000Z",
    locked_at: "2026-09-08T01:01:00.000Z", cancelled_at: null,
    updated_at: "2026-09-08T01:01:00.000Z",
  };

  it("includes verified outstanding advances in the departing result", () => {
    expect(getPlayerFundingAdjustment(buyIns, "guest")).toBe(20);
    expect(calculateEarlyCashOutNet(buyIns, "guest", 120)).toBe(40);
  });

  it("creates one payment between the host and departing player", () => {
    expect(getEarlyCashOutTransfer(earlyCashOut, players)).toEqual({
      from: "Alex", to: "Bea", amount: 40, fromPlayerId: "host", toPlayerId: "guest",
    });
  });

  it("rolls the locked result into the bank and removes the early leaver", () => {
    expect(rollForwardEarlyCashOuts(
      [player("host", -40), player("guest", 40)],
      [earlyCashOut],
    )).toEqual([player("host", 0)]);
  });

  it("processes a banker who later exits without double counting prior exits", () => {
    const bankerExit: EarlyCashOut = {
      ...earlyCashOut,
      id: "exit-2", player_id: "host", bank_player_id: "successor", net_amount: 10,
      requested_at: "2026-09-08T02:00:00.000Z", locked_at: "2026-09-08T02:01:00.000Z",
    };
    expect(rollForwardEarlyCashOuts(
      [player("guest", 40), player("host", -30), player("successor", -10)],
      [earlyCashOut, bankerExit],
    )).toEqual([player("successor", 0)]);
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
