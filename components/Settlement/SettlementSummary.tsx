"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Copy,
  RefreshCw,
  Share2,
  Sparkles,
  Trophy,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";
import { formatCurrency, formatSignedNet } from "@/lib/format";
import { defaultRecapPrivacy, deriveRecapData } from "@/lib/recap";
import { getRecapPersona } from "@/lib/recap-personality";
import { clearActiveGame } from "@/lib/session";
import { trackProductOpsEvent } from "@/lib/product-ops";
import { buildSummaryText } from "@/lib/summary";
import type { DiscrepancyAllocation, PlayerNet, Transfer } from "@/lib/settlement";
import type { Game, GameSnapshot } from "@/lib/types";
import GameRecapDialog from "./GameRecapDialog";
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
  playerCount?: number;
  discrepancyAllocation?: DiscrepancyAllocation | null;
  discrepancyAmount?: number;
}

/** Finished-game hero plus the quieter, auditable settlement record. */
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
  playerCount,
  discrepancyAllocation,
  discrepancyAmount,
}: SettlementSummaryProps) {
  const { toast } = useToast();
  const [showGameRecap, setShowGameRecap] = useState(false);

  const summaryText = buildSummaryText({
    game,
    transfers,
    nets,
    mode,
    bankName,
    totalBoughtIn,
    discrepancyAllocation,
    discrepancyAmount,
  });
  const recapData = deriveRecapData(snapshot, nets, transfers);
  const recapPlayerCount = playerCount ?? recapData.playerCount;
  const playerLabel = `${recapPlayerCount} ${recapPlayerCount === 1 ? "player" : "players"}`;
  const topFinisher = recapData.players[0] ?? null;
  const previewPersona = getRecapPersona(recapData, topFinisher?.id, 0, false);

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

  return (
    <Card padding={finalized ? "none" : "md"} className={finalized ? "overflow-hidden" : undefined}>
      {finalized ? (
        <>
          <section
            aria-labelledby="share-night-heading"
            className="relative isolate overflow-hidden bg-[#111512] px-5 py-7 text-white sm:px-8 sm:py-8"
          >
            <div aria-hidden className="absolute -right-20 -top-24 -z-10 h-72 w-72 rounded-full bg-[#dceabf]/15 blur-3xl" />
            <div aria-hidden className="absolute -bottom-28 -left-20 -z-10 h-64 w-64 rounded-full bg-blue-300/10 blur-3xl" />
            <div className="grid grid-cols-[minmax(0,1fr)_104px] items-center gap-4 sm:grid-cols-[minmax(0,1fr)_176px] sm:gap-7">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-[#dceabf] sm:gap-2 sm:px-3 sm:text-[11px] sm:tracking-[0.16em]">
                  <Sparkles aria-hidden size={13} /> Game night captured
                </div>
                <h2
                  id="share-night-heading"
                  className="mt-3 max-w-lg text-2xl font-semibold tracking-[-0.04em] text-white sm:mt-4 sm:text-4xl"
                >
                  Your game card is ready.
                </h2>
                <p className="mt-2 max-w-xl text-xs leading-5 text-gray-300 sm:mt-3 sm:text-sm sm:leading-6">
                  <span className="sm:hidden">Deal a nickname and share the night. Private by default.</span>
                  <span className="hidden sm:inline">Pick a player, deal a poker nickname, and post the night. Your card starts private—names, losses, and dollar amounts stay hidden.</span>
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold text-gray-200 sm:mt-4 sm:gap-2 sm:text-xs">
                  {topFinisher ? (
                    <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-3 py-2 sm:inline-flex">
                      <Trophy aria-hidden size={14} className="text-[#dceabf]" />
                      {topFinisher.displayName} {formatSignedNet(topFinisher.net)}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1.5 sm:px-3 sm:py-2">{playerLabel}</span>
                  <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1.5 sm:px-3 sm:py-2">{formatCurrency(totalBoughtIn)} in play</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowGameRecap(true)}
                aria-label="Open shareable game card"
                className="group relative mx-auto w-[104px] rotate-[2deg] rounded-[14px] text-left transition duration-200 hover:-translate-y-1 hover:rotate-0 focus-visible:rotate-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dceabf] focus-visible:ring-offset-4 focus-visible:ring-offset-[#111512] sm:w-[154px] sm:rounded-[18px]"
              >
                <RecapStoryCard
                  data={recapData}
                  privacy={defaultRecapPrivacy}
                  mode="summary"
                  featuredPlayerId={topFinisher?.id}
                  persona={previewPersona}
                  decorative
                />
                <span className="absolute -bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-[#dceabf] px-2 py-1.5 text-[8px] font-black uppercase tracking-wider text-[#111512] shadow-lg transition group-hover:-translate-y-0.5 sm:-bottom-3 sm:px-3 sm:py-2 sm:text-[10px]">
                  Customize <ArrowUpRight aria-hidden size={10} className="sm:h-3 sm:w-3" />
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowGameRecap(true)}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#dceabf] px-5 text-sm font-bold text-[#111512] shadow-lg shadow-black/20 transition hover:bg-[#e8f2d2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#111512] sm:mt-8 sm:w-auto"
            >
              Open & share game card
              <ArrowUpRight aria-hidden size={17} />
            </button>
          </section>

          <div className="p-5 sm:p-7">
            <div className="flex items-start gap-3">
              <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-gray-950">Settlement locked</p>
                <p className="mt-1 text-sm leading-6 text-gray-500">The payment record remains available below for everyone at the table.</p>
              </div>
            </div>

            <details className="mt-5 rounded-lg border border-gray-200 bg-gray-50/70 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-gray-900">Plain-text settlement record</summary>
              <pre className="mt-3 whitespace-pre-wrap border-t border-gray-200 pt-3 font-mono text-xs leading-6 text-gray-700">{summaryText}</pre>
            </details>

            {discrepancyAllocation && discrepancyAmount ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <p className="font-semibold">Discrepancy decision</p>
                <p className="mt-1">{formatCurrency(discrepancyAmount)} {discrepancyAllocation.method === "proportional" ? "split proportionally across eligible results." : "assigned to the selected eligible players."}</p>
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="secondary" size="md" onClick={handleCopy}>
                <Copy aria-hidden size={16} /> Copy results
              </Button>
              <Button variant="secondary" size="md" onClick={handleShare}>
                <Share2 aria-hidden size={16} /> Share record
              </Button>
            </div>

            <Link
              href={`/create?name=${encodeURIComponent(game.name)}&buyin=${game.buy_in_amount}`}
              onClick={() => { if (isHost) trackProductOpsEvent("host.returned_to_create", {}, game.id); clearActiveGame(); }}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
            >
              <RefreshCw aria-hidden size={16} /> Play again
            </Link>
          </div>
        </>
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
          onClose={() => setShowGameRecap(false)}
        />
      ) : null}
    </Card>
  );
}
