import { beforeEach, describe, expect, it, vi } from "vitest";
import { addBuyIn, createGame, endGame, getGameSnapshot } from "./data";
import { randomUUID } from "./session";

vi.mock("./supabase", () => ({ isSupabaseConfigured: false }));
vi.mock("./product-ops", () => ({ productOpsEnabled: () => false, trackProductOpsEvent: vi.fn() }));

beforeEach(() => {
  const entries = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    },
  });
});

describe("optional host opening buy-in", () => {
  it("keeps the existing opening buy-in behavior by default", async () => {
    const game = await createGame("Friday", "Casey", 20);
    const snapshot = await getGameSnapshot(game.gameId);

    expect(snapshot.buyIns).toMatchObject([
      { amount: 20, type: "buy_in", verified: true },
    ]);
    expect(snapshot.events.map((event) => event.event_type)).toContain("buy_in_added");
  });

  it("creates a host-controlled game without a monetary entry and lets the host buy in later", async () => {
    const game = await createGame("Friday", "Casey", 20, null, null, {
      hostIsPlaying: false,
    });
    const created = await getGameSnapshot(game.gameId);
    const host = created.players.find((player) => player.is_host);

    expect(host).toMatchObject({ name: "Casey", is_host: true });
    expect(created.buyIns).toEqual([]);
    expect(created.events.map((event) => event.event_type)).toEqual([
      "game_created",
      "player_joined",
    ]);

    await addBuyIn(game.gameId, host!.id, 20, "buy_in", null, randomUUID());
    const afterBuyIn = await getGameSnapshot(game.gameId);
    expect(afterBuyIn.buyIns).toMatchObject([
      { player_id: host!.id, amount: 20, type: "buy_in", verified: true },
    ]);
  });

  it("records a zero cash-out for an untouched host when settlement starts", async () => {
    const game = await createGame("Friday", "Casey", 20, null, null, {
      hostIsPlaying: false,
    });
    const host = (await getGameSnapshot(game.gameId)).players.find((player) => player.is_host);

    await endGame(game.gameId);
    expect((await getGameSnapshot(game.gameId)).cashOuts).toMatchObject([
      { player_id: host!.id, amount: 0 },
    ]);
  });
});


describe("opening currency validation", () => {
  it.each([0, -20, 0.001, 1.234, Infinity, NaN, 100_000_000])("rejects invalid opening amounts before storage: %s", async (amount) => {
    await expect(createGame("Friday", "Casey", amount)).rejects.toThrow();

  });

  it("preserves the cent boundary", async () => {
    const game = await createGame("Friday", "Casey", 0.01);
    const snapshot = await getGameSnapshot(game.gameId);
    expect(snapshot.game.buy_in_amount).toBe(0.01);
    expect(snapshot.buyIns[0].amount).toBe(0.01);
  });
});
