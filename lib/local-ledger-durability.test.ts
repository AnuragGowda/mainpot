import { beforeEach, describe, expect, it, vi } from "vitest";
import { addBuyIn, createGame, getGameSnapshot, subscribeToGame } from "./data";
import { randomUUID } from "./session";

vi.mock("./supabase", () => ({ isSupabaseConfigured: false }));
vi.mock("./product-ops", () => ({ productOpsEnabled: () => false, trackProductOpsEvent: vi.fn() }));

let entries: Map<string, string>;
let failLedgerWrites: boolean;
let failLedgerReads: boolean;

beforeEach(() => {
  entries = new Map();
  failLedgerWrites = false;
  failLedgerReads = false;
  vi.stubGlobal("window", {
    localStorage: {
      getItem(key: string) {
        if (key === "ante_store" && failLedgerReads) throw new Error("Storage denied");
        return entries.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        if (key === "ante_store" && failLedgerWrites) throw new Error("Quota exceeded");
        entries.set(key, value);
      },
      removeItem: (key: string) => entries.delete(key),
    },
  });
});

describe("device-only ledger durability", () => {
  it("rejects a failed rebuy without emitting a confirmed snapshot, then retries once durably", async () => {
    const game = await createGame("Friday", "Casey", 20);
    const before = await getGameSnapshot(game.gameId);
    const onSnapshot = vi.fn();
    const unsubscribe = subscribeToGame(game.gameId, onSnapshot);
    const operation = randomUUID();
    try {
      failLedgerWrites = true;
      await expect(addBuyIn(game.gameId, before.players[0].id, 7, "rebuy", null, operation)).rejects.toThrow("not saved");
      expect(onSnapshot).not.toHaveBeenCalled();
      expect((await getGameSnapshot(game.gameId)).buyIns).toHaveLength(1);
      failLedgerWrites = false;
      await addBuyIn(game.gameId, before.players[0].id, 7, "rebuy", null, operation);
      await addBuyIn(game.gameId, before.players[0].id, 7, "rebuy", null, operation);
      const reloaded = await getGameSnapshot(game.gameId);
      expect(reloaded.buyIns.map(entry => entry.amount)).toEqual([20, 7]);
      expect(reloaded.events.filter(event => event.event_type === "buy_in_added")).toHaveLength(2);
    } finally {
      unsubscribe();
    }
  });

  it("does not announce or retain a game when its first ledger save fails", async () => {
    failLedgerWrites = true;
    await expect(createGame("Friday", "Casey", 20)).rejects.toThrow("not saved");
    expect(entries.has("ante_store")).toBe(false);
  });

  it.each(["not-json", "null", JSON.stringify({ games: "broken", players: [] })])(
    "preserves unreadable saved data rather than replacing it (%s)", async (raw) => {
      entries.set("ante_store", raw);
      await expect(createGame("New table", "Casey", 20)).rejects.toThrow("has not been replaced");
      expect(entries.get("ante_store")).toBe(raw);
    },
  );

  it("retains the original ledger when reads are denied", async () => {
    const game = await createGame("Friday", "Casey", 20);
    const raw = entries.get("ante_store");
    failLedgerReads = true;
    await expect(getGameSnapshot(game.gameId)).rejects.toThrow("has not been replaced");
    await expect(createGame("New table", "Casey", 20)).rejects.toThrow("has not been replaced");
    expect(entries.get("ante_store")).toBe(raw);
    failLedgerReads = false;
    expect((await getGameSnapshot(game.gameId)).game.name).toBe("Friday");
  });
});
