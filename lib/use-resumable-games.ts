"use client";

import { useEffect, useState } from "react";
import { withTimeout } from "./request-timeout";
import { getGame } from "./data";
import { ACTIVE_GAMES_CHANGED, clearActiveGame, getActiveGames } from "./session";
import type { GameStatus } from "./types";

export interface ResumableGame {
  code: string;
  name: string;
  status: Exclude<GameStatus, "ended">;
}

/** Revalidate on return, including cached browser history and another tab ending a game. */
export function useResumableGames(): ResumableGame[] {
  const [games, setGames] = useState<ResumableGame[]>([]);
  useEffect(() => {
    let disposed = false;
    let revision = 0;
    async function refresh() {
      const currentRevision = ++revision;
      const results = await Promise.all(getActiveGames().map(async (code) => {
        try {
          const game = await withTimeout(getGame(code), "Could not refresh this saved table.", 10_000);
          if (!game || game.status === "ended") {
            clearActiveGame(code);
            return null;
          }
          return { code: game.code, name: game.name, status: game.status } as ResumableGame;
        } catch {
          // An unavailable table must not prevent other tables being resumed.
          return null;
        }
      }));
      if (!disposed && currentRevision === revision) {
        setGames(results.filter((game): game is ResumableGame => game !== null));
      }
    }
    const onReturn = () => { if (document.visibilityState === "visible") void refresh(); };
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === "ante_active_game" || event.key === "ante_active_games") void refresh();
    };
    void refresh();
    window.addEventListener("focus", onReturn);
    window.addEventListener("pageshow", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("storage", onStorage);
    window.addEventListener(ACTIVE_GAMES_CHANGED, onReturn);
    const interval = window.setInterval(onReturn, 15_000);
    return () => {
      disposed = true;
      ++revision;
      window.clearInterval(interval);
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("pageshow", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ACTIVE_GAMES_CHANGED, onReturn);
    };
  }, []);
  return games;
}
