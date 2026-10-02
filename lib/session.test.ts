import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_GAMES_CHANGED, clearActiveGame, getActiveGames, setActiveGame } from "./session";

let values: Map<string, string>;
let events: EventTarget;
beforeEach(() => {
  values = new Map();
  events = new EventTarget();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    dispatchEvent: (event: Event) => events.dispatchEvent(event),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("table-specific resume storage", () => {
  it("removing a finalized game preserves the unrelated active game", () => {
    setActiveGame("TABLEA");
    setActiveGame("TABLEB");
    clearActiveGame("TABLEA");
    expect(getActiveGames()).toEqual(["TABLEB"]);
    expect(values.get("ante_active_game")).toBe("TABLEB");
  });

  it("removing the current finalized game promotes another recoverable table", () => {
    setActiveGame("TABLEA");
    setActiveGame("TABLEB");
    clearActiveGame("TABLEB");
    expect(getActiveGames()).toEqual(["TABLEA"]);
    expect(values.get("ante_active_game")).toBe("TABLEA");
  });

  it("notifies mounted same-tab resume cards only when the list changes", () => {
    const changed = vi.fn();
    events.addEventListener(ACTIVE_GAMES_CHANGED, changed);
    setActiveGame("TABLEA");
    setActiveGame("TABLEA");
    clearActiveGame("OTHER1");
    expect(changed).toHaveBeenCalledTimes(1);
    clearActiveGame("TABLEA");
    expect(changed).toHaveBeenCalledTimes(2);
    expect(getActiveGames()).toEqual([]);
  });

  it("recovers a legacy single code when the multi-table value is malformed", () => {
    values.set("ante_active_game", "LEGACY");
    values.set("ante_active_games", "broken");
    expect(getActiveGames()).toEqual(["LEGACY"]);
    clearActiveGame("LEGACY");
    expect(values.has("ante_active_game")).toBe(false);
    expect(values.has("ante_active_games")).toBe(false);
  });

  it("persists a created table for the next document without refreshing departing resume cards", () => {
    setActiveGame("TABLEA");
    const changed = vi.fn();
    events.addEventListener(ACTIVE_GAMES_CHANGED, changed);
    setActiveGame("TABLEB", { notify: false });
    expect(changed).not.toHaveBeenCalled();
    expect(getActiveGames()).toEqual(["TABLEB", "TABLEA"]);
    expect(values.get("ante_active_game")).toBe("TABLEB");
    setActiveGame("TABLEC");
    expect(changed).toHaveBeenCalledOnce();
  });
});
