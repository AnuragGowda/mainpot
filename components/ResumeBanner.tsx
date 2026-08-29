"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getGame } from "@/lib/data";
import { getActiveGame } from "@/lib/session";

/**
 * Landing-page affordance that lets players jump back into their most recent
 * active game. Reads the session's active game code on mount, validates it
 * against the data layer, and only renders when a non-ended game exists.
 */
export default function ResumeBanner() {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const activeCode = getActiveGame();
    if (!activeCode) {
      return;
    }
    getGame(activeCode)
      .then((game) => {
        if (!cancelled && game && game.status !== "ended") {
          setCode(game.code);
        }
      })
      .catch(() => {
        // No valid active game — show nothing.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!code) {
    return null;
  }

  return (
    <div className="flex justify-center pt-8">
      <Link
        href={`/game/${code}`}
        className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-600 transition-colors duration-150 hover:bg-emerald-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
      >
        Resume your game
      </Link>
    </div>
  );
}