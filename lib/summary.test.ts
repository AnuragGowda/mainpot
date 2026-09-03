import { describe, expect, it } from "vitest";
import { buildSummaryText } from "./summary";
import type { Game } from "./types";

const game: Game = {
  id: "game-1",
  code: "ABC123",
  name: "Friday game",
  host_user_id: null,
  host_session_id: "host-session",
  host_name: "Alex",
  buy_in_amount: 20,
  status: "ended",
  host_is_anonymous: true,
  expires_at: null,
  created_at: "2026-09-02T18:00:00.000Z",
  ended_at: "2026-09-02T22:00:00.000Z",
};

describe("buildSummaryText", () => {
  it("includes before, adjustment, and final results for affected players", () => {
    const summary = buildSummaryText({
      game,
      transfers: [{
        from: "Bea",
        to: "Alex",
        amount: 30,
        fromPlayerId: "b",
        toPlayerId: "a",
      }],
      beforeDiscrepancyNets: [
        { playerId: "a", name: "Alex", net: 40 },
        { playerId: "b", name: "Bea", net: -30 },
      ],
      nets: [
        { playerId: "a", name: "Alex", net: 30 },
        { playerId: "b", name: "Bea", net: -30 },
      ],
      mode: "min",
      totalBoughtIn: 40,
      discrepancyAllocation: { method: "proportional", playerIds: ["a"] },
      discrepancyAmount: 10,
    });

    expect(summary).toContain("Discrepancy: $10.00");
    expect(summary).toContain("Allocation: all affected players, proportional");
    expect(summary).toContain("Result changes:\nAlex: +$40.00 -$10.00 discrepancy → +$30.00");
    expect(summary).toContain("Final net:\nAlex: +$30.00\nBea: -$30.00");
    expect(summary).not.toContain("Bea: -$30.00 before discrepancy");
  });

  it("labels exact allocations in the settlement record", () => {
    const summary = buildSummaryText({
      game,
      transfers: [],
      beforeDiscrepancyNets: [
        { playerId: "a", name: "Alex", net: 40 },
        { playerId: "b", name: "Bea", net: -30 },
      ],
      nets: [
        { playerId: "a", name: "Alex", net: 30 },
        { playerId: "b", name: "Bea", net: -30 },
      ],
      mode: "min",
      totalBoughtIn: 40,
      discrepancyAllocation: {
        method: "custom",
        playerIds: ["a"],
        playerAllocations: [{ playerId: "a", amount: 10 }],
      },
      discrepancyAmount: 10,
    });

    expect(summary).toContain("Allocation: exact amounts");
  });
});
