import { describe, expect, it } from "vitest";
import { getPaymentProgress } from "./payment-progress";
import type { GameSnapshot } from "./types";

function fixture(): GameSnapshot {
  return {
    game: { id: "game", status: "ended", settlement_mode: "min", discrepancy_allocation: null },
    players: [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }, { id: "c", name: "Casey" }],
    buyIns: ["a", "b", "c"].map((player_id) => ({ player_id, amount: 20, verified: true, fronted_by_player_id: null })),
    cashOuts: [{ player_id: "a", amount: 40 }, { player_id: "b", amount: 0 }, { player_id: "c", amount: 20 }],
    earlyCashOuts: [], events: [],
  } as unknown as GameSnapshot;
}

describe("locked game payment progress", () => {
  it("counts transfers that have no status row and ignores stale plan rows", () => {
    expect(getPaymentProgress(fixture(), [])).toEqual({ total: 1, markedSent: 0 });
    expect(getPaymentProgress(fixture(), [{ key: "bank:b:a:20.00", settled: true }])).toEqual({ total: 1, markedSent: 0 });
    expect(getPaymentProgress(fixture(), [{ key: "min:b:a:20.00", settled: true }])).toEqual({ total: 1, markedSent: 1 });
  });
  it("counts the persisted banker plan after reload", () => {
    const snapshot = fixture(); snapshot.game.settlement_mode = "bank"; snapshot.game.settlement_bank_player_id = "c";
    expect(getPaymentProgress(snapshot, [{ key: "bank:c:a:20.00", settled: true }])).toEqual({ total: 2, markedSent: 1 });
  });
  it("includes separately locked early-exit payments exactly once", () => {
    const snapshot = fixture();
    snapshot.cashOuts[0].amount = 35;
    snapshot.cashOuts[1].amount = 5;
    snapshot.earlyCashOuts = [{ player_id: "b", bank_player_id: "a", status: "locked", net_amount: -15, locked_at: "2026-09-26T00:00:00Z" }] as GameSnapshot["earlyCashOuts"];
    expect(getPaymentProgress(snapshot, [])).toEqual({ total: 1, markedSent: 0 });
    expect(getPaymentProgress(snapshot, [{ key: "early_exit:b:a:15.00", settled: true }])).toEqual({ total: 1, markedSent: 1 });
  });
  it("uses the saved discrepancy allocation instead of inventing an extra transfer", () => {
    const snapshot = fixture(); snapshot.cashOuts[0].amount = 30;
    snapshot.game.discrepancy_allocation = { method: "selected", player_ids: ["b"], amount: 10 };
    expect(getPaymentProgress(snapshot, [{ key: "min:b:a:10.00", settled: true }])).toEqual({ total: 1, markedSent: 1 });
  });
});
