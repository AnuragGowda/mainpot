"use client";

import { ArrowRight, CircleDollarSign, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { getGame } from "@/lib/data";
import { navigateToFreshAppPage } from "@/lib/navigation";
import { clearActiveGame, getActiveGames } from "@/lib/session";
import type { GameStatus } from "@/lib/types";

export interface ResumableGame {
  code: string;
  name: string;
  status: Exclude<GameStatus, "ended">;
}

export function ResumeGameCard({ game }: { game: ResumableGame }) {
  const isSettling = game.status === "settling";

  return (
    <section aria-label="Resume active game" className="w-full max-w-md rounded-xl border border-gray-300 bg-white/80 p-3.5 shadow-sm backdrop-blur">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isSettling ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
          {isSettling ? <CircleDollarSign aria-hidden size={18} /> : <Play aria-hidden size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            {isSettling ? "Settlement ready" : "Active game waiting"}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-gray-950">{game.name}</p>
          <p className="mt-0.5 text-xs leading-5 text-gray-500">
            {isSettling ? "Cash-outs and payments still need a final review." : "Your table is still in progress."}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigateToFreshAppPage(`/game/${game.code}`)}
        className="group mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
      >
        Resume game
        <ArrowRight aria-hidden size={15} className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </section>
  );
}

/**
 * Affordance that lets players jump back into their most recent
 * active game. Reads the session's active game code on mount, validates it
 * against the data layer, and only renders when a non-ended game exists.
 */
export default function ResumeBanner() {
  const [games, setGames] = useState<ResumableGame[]>([]);

  useEffect(() => {
    let cancelled = false;
    const activeCodes = getActiveGames();
    if (!activeCodes.length) {
      return;
    }
    void Promise.all(activeCodes.map(async (code) => {
      try {
        const game = await getGame(code);
        if (!game || game.status === "ended") {
          clearActiveGame(code);
          return null;
        }
        return { code: game.code, name: game.name, status: game.status } as ResumableGame;
      } catch {
        return null;
      }
    })).then((results) => {
      if (!cancelled) setGames(results.filter((game): game is ResumableGame => game !== null));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!games.length) {
    return null;
  }

  return <div className="space-y-3">{games.map((game) => <ResumeGameCard key={game.code} game={game} />)}</div>;
}
