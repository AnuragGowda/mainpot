"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { getGame } from "@/lib/data";
import { getActiveGame } from "@/lib/session";

/**
 * Landing-page affordance that lets players jump back into their most recent
 * active game. Reads the session's active game code on mount, validates it
 * against the data layer, and only renders when a non-ended game exists.
 */
export default function ResumeBanner() {
  const [game, setGame] = useState<{ code: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const activeCode = getActiveGame();
    if (!activeCode) {
      return;
    }
    getGame(activeCode)
      .then((game) => {
        if (!cancelled && game && game.status !== "ended") {
          setGame({ code: game.code, name: game.name });
        }
      })
      .catch(() => {
        // No valid active game — show nothing.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!game) {
    return null;
  }

  return (
    <Link
      href={`/game/${game.code}`}
      className="group inline-flex h-11 items-center gap-2.5 rounded-lg border border-dotted border-gray-400 bg-white/20 px-4 text-sm font-semibold text-gray-900 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-gray-600 hover:bg-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-4"
    >
      <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.10)]" aria-hidden="true" />
      Continue {game.name}
      <ArrowRight aria-hidden size={15} className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
