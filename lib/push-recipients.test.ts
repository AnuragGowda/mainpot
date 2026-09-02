import { describe, expect, it } from "vitest";
import { getPushRecipientIds } from "./push-recipients";

const players = [
  { user_id: "host", left_at: null },
  { user_id: "at-table", left_at: null },
  { user_id: "left-player", left_at: "2026-09-02T00:00:00.000Z" },
  { user_id: null, left_at: null },
];

describe("getPushRecipientIds", () => {
  it("sends settlement and finalization alerts to every game participant", () => {
    expect(getPushRecipientIds(players, "game_settling", "host"))
      .toEqual(["host", "at-table", "left-player"]);
    expect(getPushRecipientIds(players, "game_finalized", "host"))
      .toEqual(["host", "at-table", "left-player"]);
  });

  it("keeps join alerts scoped to other active players", () => {
    expect(getPushRecipientIds(players, "player_joined", "host"))
      .toEqual(["at-table"]);
  });
});
