import { describe, expect, it } from "vitest";
import { computeUserStats } from "./stats";

describe("computeUserStats", () => {
  it("returns zeroed stats for empty nets", () => {
    expect(computeUserStats([])).toEqual({
      gamesPlayed: 0,
      totalPL: 0,
      avgPL: 0,
      biggestWin: 0,
      biggestLoss: 0,
      winRate: 0,
    });
  });

  it("handles all-positive nets", () => {
    const stats = computeUserStats([30, 20]);
    expect(stats.gamesPlayed).toBe(2);
    expect(stats.totalPL).toBe(50);
    expect(stats.avgPL).toBe(25);
    expect(stats.biggestWin).toBe(30);
    expect(stats.biggestLoss).toBe(0);
    expect(stats.winRate).toBe(100);
  });

  it("handles mixed nets", () => {
    const stats = computeUserStats([50, -30, 20]);
    expect(stats.gamesPlayed).toBe(3);
    expect(stats.totalPL).toBe(40);
    expect(stats.avgPL).toBeCloseTo(13.33, 2);
    expect(stats.biggestWin).toBe(50);
    expect(stats.biggestLoss).toBe(-30);
    expect(stats.winRate).toBeCloseTo(66.7, 1);
  });

  it("handles all-negative nets", () => {
    const stats = computeUserStats([-30, -20]);
    expect(stats.gamesPlayed).toBe(2);
    expect(stats.totalPL).toBe(-50);
    expect(stats.avgPL).toBe(-25);
    expect(stats.biggestWin).toBe(0);
    expect(stats.biggestLoss).toBe(-30);
    expect(stats.winRate).toBe(0);
  });

  it("rounds fractional totals to 2 decimals", () => {
    const stats = computeUserStats([0.1, 0.2]);
    expect(stats.totalPL).toBe(0.3);
    expect(stats.avgPL).toBe(0.15);
  });
});