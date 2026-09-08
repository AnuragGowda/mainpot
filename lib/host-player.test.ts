import { beforeEach, describe, expect, it, vi } from "vitest";
import { addBuyIn, addHostPlayer, createGame, endGame, getGameSnapshot, joinGame, requestEarlyCashOut, transferHost } from "./data";
import { randomUUID } from "./session";

vi.mock("./supabase", () => ({ isSupabaseConfigured: false }));
vi.mock("./product-ops", () => ({ productOpsEnabled: () => false, trackProductOpsEvent: vi.fn() }));

beforeEach(() => {
  const entries = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  } });
});

describe("host-managed seats in local mode", () => {
  it("atomically adds a seat and verified opening buy-in once without replacing the host", async () => {
    const game = await createGame("Friday", "Casey", 20);
    const hostSession = window.localStorage.getItem("ante_session_id");
    const key = randomUUID();
    const first = await addHostPlayer(game.gameId, "  Jordan  ", 15.50, key);
    const retry = await addHostPlayer(game.gameId, "Jordan", 15.50, key);
    expect(first.id).toBe(retry.id);
    await expect(addHostPlayer(game.gameId, "Sam", 15.50, key)).rejects.toThrow("already used");
    await expect(addHostPlayer(game.gameId, "Jordan", 20, key)).rejects.toThrow("already used");
    expect(first).toMatchObject({ name: "Jordan", session_id: null, user_id: null, is_host: false });
    const snapshot = await getGameSnapshot(game.gameId);
    expect(snapshot.players).toHaveLength(2);
    expect(snapshot.players.find((p) => p.is_host)?.session_id).toBe(hostSession);
    expect(snapshot.buyIns.filter((b) => b.player_id === first.id)).toMatchObject([{ amount: 15.50, verified: true }]);
    expect(snapshot.events.filter((e) => e.subject_player_id === first.id)).toHaveLength(2);
    expect(window.localStorage.getItem("ante_session_id")).toBe(hostSession);
  });

  it("supports zero opening buy-in, later buy-ins and a host-recorded early cash-out", async () => {
    const game = await createGame("Friday", "Casey", 20);
    const player = await addHostPlayer(game.gameId, "Jordan", 0, randomUUID());
    expect((await getGameSnapshot(game.gameId)).buyIns).toHaveLength(1);
    await addBuyIn(game.gameId, player.id, 10, "buy_in", null, randomUUID());
    const request = await requestEarlyCashOut(game.gameId, player.id, 5);
    const snapshot = await getGameSnapshot(game.gameId);
    expect(request.status).toBe("requested");
    expect(snapshot.events.find((e) => e.event_type === "early_cash_out_requested")?.actor_player_id).toBe(snapshot.players.find((p) => p.is_host)?.id);
    await expect(transferHost(game.gameId, player.id)).rejects.toThrow("own device");
    expect((await getGameSnapshot(game.gameId)).players.find((p) => p.is_host)?.name).toBe("Casey");
  });

  it("rejects another player recording a host-managed seat or its money", async () => {
    const game = await createGame("Friday", "Casey", 20);
    const player = await addHostPlayer(game.gameId, "Jordan", 20, randomUUID());
    window.localStorage.setItem("ante_session_id", randomUUID());
    await joinGame(game.code, "Taylor");
    await expect(addHostPlayer(game.gameId, "Sam", 20, randomUUID())).rejects.toThrow("Only the host");
    await expect(addBuyIn(game.gameId, player.id, 20, "rebuy", null, randomUUID())).rejects.toThrow("Only the player or host");
    await expect(requestEarlyCashOut(game.gameId, player.id, 20)).rejects.toThrow("Only the player or host");
  });

  it("rejects invalid amounts and names, closed games, and seats over the limit", async () => {
    const game = await createGame("Friday", "Casey", 20);
    for (const amount of [-1, NaN, Infinity, 100000000]) {
      await expect(addHostPlayer(game.gameId, "Jordan", amount, randomUUID())).rejects.toThrow("buy-in");
    }
    for (const name of ["", "A".repeat(33), "A\nB"]) {
      await expect(addHostPlayer(game.gameId, name, 20, randomUUID())).rejects.toThrow();
    }
    for (let i = 0; i < 11; i++) await addHostPlayer(game.gameId, `Player ${i}`, 0, randomUUID());
    await expect(addHostPlayer(game.gameId, "One too many", 0, randomUUID())).rejects.toThrow("maximum");
    await endGame(game.gameId);
    await expect(addHostPlayer(game.gameId, "Late arrival", 20, randomUUID())).rejects.toThrow("closed");
  });
});
