"use client";

import { ArrowRight, CircleDollarSign, Play } from "lucide-react";
import { navigateToFreshAppPage } from "@/lib/navigation";
import { useResumableGames, type ResumableGame } from "@/lib/use-resumable-games";
export type { ResumableGame } from "@/lib/use-resumable-games";

export function ResumeGameCard({ game }: { game: ResumableGame }) {
  const isSettling = game.status === "settling";

  return (
    <section aria-label={isSettling ? "Finish game cash-outs" : "Resume active game"} className="w-full max-w-md rounded-xl border border-gray-300 bg-white/80 p-3.5 shadow-sm backdrop-blur">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isSettling ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
          {isSettling ? <CircleDollarSign aria-hidden size={18} /> : <Play aria-hidden size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            {isSettling ? "Play ended · cash-outs to finish" : "Active game waiting"}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-gray-950">{game.name}</p>
          <p className="mt-0.5 text-xs leading-5 text-gray-500">
            {isSettling ? "The playing session is over. Its cash-outs are saved here; you can start another table." : "Your table is still in progress."}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigateToFreshAppPage(`/game/${game.code}`)}
        className="group mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
      >
        {isSettling ? "Finish cash-outs" : "Resume game"}
        <ArrowRight aria-hidden size={15} className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </section>
  );
}

/**
 * Affordance that lets players jump back into their most recent
 * active game. Revalidates saved codes on return and while visible, and only
 * renders games that still need play or cash-out completion.
 */
export default function ResumeBanner() {
  const games = useResumableGames();

  if (!games.length) {
    return null;
  }

  return <div className="space-y-3">{games.map((game) => <ResumeGameCard key={game.code} game={game} />)}</div>;
}
