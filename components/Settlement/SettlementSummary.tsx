"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Copy,
  RefreshCw,
  Share2,
  Sparkles,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";
import { defaultRecapPrivacy, deriveRecapData } from "@/lib/recap";
import { clearActiveGame } from "@/lib/session";
import { trackProductOpsEvent } from "@/lib/product-ops";
import { recapSessionKey } from "@/lib/recap-session";
import { buildSummaryText } from "@/lib/summary";
import type { DiscrepancyAllocation, PlayerNet, Transfer } from "@/lib/settlement";
import type { Game, GameSnapshot } from "@/lib/types";
import GameRecapDialog from "./GameRecapDialog";
import RecapReveal, { type RecapRevealHandle, type RecapRevealState } from "./RecapReveal";
import RecapStoryCard from "./RecapStoryCard";

export interface SettlementSummaryProps {
  snapshot: GameSnapshot;
  game: Game;
  transfers: Transfer[];
  nets: PlayerNet[];
  mode: "min" | "bank";
  bankName?: string;
  totalBoughtIn: number;
  isHost: boolean;
  finalized?: boolean;
  presentation?: "card" | "record";
  discrepancyAllocation?: DiscrepancyAllocation | null;
  discrepancyAmount?: number;
  beforeDiscrepancyNets?: PlayerNet[];
  /** The signed-in player's personal recap. Hosts fall back to the top result. */
  featuredPlayerId?: string;
}

/** Finished-game recap card and the quieter, auditable settlement record. */
export default function SettlementSummary({
  snapshot,
  game,
  transfers,
  nets,
  mode,
  bankName,
  totalBoughtIn,
  isHost,
  finalized = false,
  presentation = "card",
  discrepancyAllocation,
  discrepancyAmount,
  beforeDiscrepancyNets,
  featuredPlayerId,
}: SettlementSummaryProps) {
  const { toast } = useToast();
  const [showGameRecap, setShowGameRecap] = useState(false);
  const [recapRevealState, setRecapRevealState] = useState<RecapRevealState>('ready');
  const recapRevealRef = useRef<RecapRevealHandle>(null);

  const summaryText = buildSummaryText({
    game,
    transfers,
    nets,
    mode,
    bankName,
    totalBoughtIn,
    discrepancyAllocation,
    discrepancyAmount,
    beforeDiscrepancyNets,
  });
  const recapData = deriveRecapData(snapshot, nets, transfers);
  const featuredPlayer = recapData.players.find((player) => player.id === featuredPlayerId)
    ?? recapData.players[0]
    ?? null;
  const revealSessionKey = recapSessionKey(recapData.gameId, featuredPlayer?.id);
  async function copyFallback() {
    try {
      await copyText(summaryText);
      toast("Copied!", "success");
    } catch {
      toast("Couldn't copy the summary.", "error");
    }
  }

  async function handleCopy() {
    await copyFallback();
  }

  async function handleShare() {
    const gameUrl = typeof window !== "undefined"
      ? `${window.location.origin}/game/${game.code}`
      : "";
    const shareText = gameUrl ? `${summaryText}\n\nView this game: ${gameUrl}` : summaryText;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `${game.name} settlement · Mainpot`,
          text: summaryText,
          ...(gameUrl ? { url: gameUrl } : {}),
        });
      } catch (err) {
        // User cancelled the share sheet — nothing to do.
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        try {
          await copyText(shareText);
          toast("Settlement and game link copied", "success");
        } catch {
          toast("Couldn't share the settlement.", "error");
        }
      }
      return;
    }

    try {
      await copyText(shareText);
      toast("Settlement and game link copied", "success");
    } catch {
      toast("Couldn't share the settlement.", "error");
    }
  }

  if (finalized && presentation === "card") {
    return (
      <>
        <section aria-label="Game recap" className="mx-auto w-full max-w-[300px] sm:max-w-[340px]">
          <div className="mb-3 flex items-end justify-between gap-4 px-1">
            <div>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-gray-950">Your game card.</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (recapRevealRef.current?.reveal()) setShowGameRecap(true);
            }}
            disabled={recapRevealState === 'revealing'}
            aria-label={recapRevealState === 'complete'
              ? 'Customize and share your game card'
              : recapRevealState === 'revealing'
                ? 'Your game card is being revealed'
                : 'Reveal your game card'}
            className="group relative block w-full overflow-hidden rounded-[28px] border border-gray-950/10 bg-[#f7f6ef] p-2.5 text-left shadow-[0_18px_45px_rgba(17,21,18,0.14)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_24px_52px_rgba(17,21,18,0.2)] disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-4"
          >
            <span className="block overflow-hidden rounded-[20px]">
              <RecapReveal
                ref={recapRevealRef}
                sessionKey={revealSessionKey}
                description="Your revealed game card"
                activation="manual"
                onStateChange={setRecapRevealState}
              >
                <RecapStoryCard
                  data={recapData}
                  privacy={defaultRecapPrivacy}
                  mode="summary"
                  featuredPlayerId={featuredPlayer?.id}
                  decorative
                />
              </RecapReveal>
            </span>
            <span className="mt-2.5 flex min-h-12 items-center justify-between rounded-[18px] bg-gray-950 px-4 text-sm font-semibold text-white transition group-hover:bg-emerald-950">
              <span className="inline-flex items-center gap-2">
                {recapRevealState === 'complete' ? <Share2 aria-hidden size={16} /> : <Sparkles aria-hidden size={16} />}
                {recapRevealState === 'complete' ? 'Customize & share' : recapRevealState === 'revealing' ? 'Revealing…' : 'Tap to reveal'}
              </span>
              {recapRevealState === 'complete'
                ? <ArrowUpRight aria-hidden size={18} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                : <Sparkles aria-hidden size={18} className="transition-transform group-hover:rotate-12 group-hover:scale-110" />}
            </span>
          </button>
        </section>
        {showGameRecap ? <GameRecapDialog snapshot={snapshot} nets={nets} transfers={transfers} featuredPlayerId={featuredPlayer?.id} onClose={() => setShowGameRecap(false)} /> : null}
      </>
    );
  }

  return (
    <Card padding="md">
      {finalized ? (
          <div>
            <div className="flex items-start gap-3">
              <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-gray-950">Settlement locked</p>
              </div>
            </div>

            <details className="group mt-5 rounded-lg border border-gray-200 bg-gray-50/70">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 py-px pl-3 pr-px text-sm font-semibold text-gray-900">
                <ChevronRight aria-hidden className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
                <span className="min-w-0 flex-1">Payment record</span>
                <span className="flex shrink-0">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handleCopy();
                  }}
                  aria-label="Copy payment record"
                  title="Copy payment record"
                  className="w-11 px-0 shadow-none"
                >
                  <Copy aria-hidden size={18} />
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handleShare();
                  }}
                  aria-label="Share payment record"
                  title="Share payment record"
                  className="w-11 px-0 shadow-none"
                >
                  <Share2 aria-hidden size={18} />
                </Button>
                </span>
              </summary>
              <pre className="mx-4 mb-3 whitespace-pre-wrap border-t border-gray-200 pt-3 font-mono text-xs leading-6 text-gray-700">{summaryText}</pre>
            </details>

            <Link
              href={`/create?name=${encodeURIComponent(game.name)}&buyin=${game.buy_in_amount}`}
              onClick={() => { if (isHost) trackProductOpsEvent("host.returned_to_create", {}, game.id); clearActiveGame(game.code); }}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
            >
              <RefreshCw aria-hidden size={16} /> Play again
            </Link>
          </div>
      ) : (
        <>
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">Settlement summary</h2>
          <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50/80 p-4 font-mono text-sm leading-6 text-gray-800">{summaryText}</pre>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" size="md" onClick={handleCopy} className="sm:flex-1">
              <Copy aria-hidden size={16} /> Copy results
            </Button>
            <Button size="md" onClick={handleShare} className="sm:flex-1">
              <Share2 aria-hidden size={16} /> Share settlement
            </Button>
          </div>
        </>
      )}

      {showGameRecap ? (
        <GameRecapDialog
          snapshot={snapshot}
          nets={nets}
          transfers={transfers}
          featuredPlayerId={featuredPlayer?.id}
          onClose={() => setShowGameRecap(false)}
        />
      ) : null}
    </Card>
  );
}
