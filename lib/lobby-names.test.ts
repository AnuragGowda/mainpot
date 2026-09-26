import { beforeEach, describe, expect, it, vi } from "vitest";
import { addHostPlayer, createGame, getGameSnapshot, joinGame, leaveGame, removePlayer, restorePlayerToTableLocal } from "./data";
import { lobbyNameKey } from "./name-validation";
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

describe("lobby seat name uniqueness", () => {
  it("normalizes Unicode width, composed characters, case and whitespace", () => {
    expect(lobbyNameKey(" ＪＯＲＤＡＮ ")).toBe("jordan");
    expect(lobbyNameKey("Jor\u200bdan\ufe0f")).toBe("jordan");
    expect(lobbyNameKey("José  Doe")).toBe(lobbyNameKey("JOSE\u0301\u00a0Doe"));
  });

  it("blocks managed and guest collisions without adding seats or buy-ins", async () => {
    const game = await createGame("Friday", "Casey", 20);
    await addHostPlayer(game.gameId, "Jordan Doe", 20, randomUUID());
    for (const name of ["casey", "Jordan   Doe", "Ｊｏｒｄａｎ Doe"]) {
      await expect(addHostPlayer(game.gameId, name, 20, randomUUID())).rejects.toThrow("already used");
    }
    window.localStorage.setItem("ante_session_id", randomUUID());
    await expect(joinGame(game.code, " jordan   doe ")).rejects.toThrow("already used");
    const snapshot = await getGameSnapshot(game.gameId);
    expect(snapshot.players).toHaveLength(2);
    expect(snapshot.buyIns).toHaveLength(2);
  });

  it("resumes the same seat without another opening entry and keeps departed names reserved", async () => {
    const game = await createGame("Friday", "Casey", 20);
    window.localStorage.setItem("ante_session_id", randomUUID());
    const guest = await joinGame(game.code, "Jordan");
    expect(await joinGame(game.code, "JORDAN")).toEqual(guest);
    await leaveGame(guest.playerId);
    window.localStorage.setItem("ante_session_id", randomUUID());
    await expect(joinGame(game.code, "Jordan")).rejects.toThrow("already used");
    expect((await getGameSnapshot(game.gameId)).buyIns).toHaveLength(2);
  });

  it("does not resume an authenticated local seat with a copied browser session", async () => {
    const hostUser = randomUUID();
    const game = await createGame("Friday", "Casey", 20, hostUser);
    await expect(joinGame(game.code, "Casey", randomUUID())).rejects.toThrow("already used");
    window.localStorage.setItem("ante_session_id", randomUUID());
    const resumed = await joinGame(game.code, "Casey", hostUser);
    expect(resumed.playerId).toBe((await getGameSnapshot(game.gameId)).players[0].id);
    expect((await getGameSnapshot(game.gameId)).buyIns).toHaveLength(1);
  });

  it("blocks guest deletion of ledger-backed seats and host self-deletion", async () => {
    const game = await createGame("Friday", "Casey", 20);
    const hostSession = window.localStorage.getItem("ante_session_id")!;
    window.localStorage.setItem("ante_session_id", randomUUID());
    const guest = await joinGame(game.code, "Jordan");
    await expect(removePlayer(guest.playerId)).rejects.toThrow("Only the active host");
    expect((await getGameSnapshot(game.gameId)).buyIns).toHaveLength(2);
    window.localStorage.setItem("ante_session_id", hostSession);
    const host = (await getGameSnapshot(game.gameId)).players.find(player => player.is_host)!;
    await expect(removePlayer(host.id)).rejects.toThrow("Transfer the host role");
    await removePlayer(guest.playerId);
    expect((await getGameSnapshot(game.gameId)).players).toHaveLength(1);
  });

  it("allows the same display name in a different game", async () => {
    const first = await createGame("Friday", "Casey", 20);
    const second = await createGame("Saturday", "Casey", 20);
    await addHostPlayer(first.gameId, "Jordan", 20, randomUUID());
    await expect(addHostPlayer(second.gameId, "Jordan", 20, randomUUID())).resolves.toMatchObject({ name: "Jordan" });
  });
  it("requires host approval to return and preserves exactly one seat and opening entry", async () => {
    const game = await createGame("Friday", "Casey", 20);
    const hostSession = window.localStorage.getItem("ante_session_id")!;
    window.localStorage.setItem("ante_session_id", randomUUID());
    const guest = await joinGame(game.code, "Jordan");
    await leaveGame(guest.playerId);
    await expect(restorePlayerToTableLocal(game.gameId, guest.playerId)).rejects.toThrow("Only the host");
    window.localStorage.setItem("ante_session_id", hostSession);
    await restorePlayerToTableLocal(game.gameId, guest.playerId);
    await restorePlayerToTableLocal(game.gameId, guest.playerId);
    const snapshot = await getGameSnapshot(game.gameId);
    expect(snapshot.players).toHaveLength(2);
    expect(snapshot.players.find(player => player.id === guest.playerId)?.left_at).toBeNull();
    expect(snapshot.buyIns).toHaveLength(2);
    expect(snapshot.events.filter(event => event.metadata.returned_to_table)).toHaveLength(1);
  });

});
