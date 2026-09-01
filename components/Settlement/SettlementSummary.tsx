"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Copy,
  RefreshCw,
  Share2,
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

/**
 * Settlement summary card: plain-text recap plus Copy / Share / New game.
 */
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
    <Card padding="md">
      {finalized ? (
        <div className="flex items-start gap-3">
          <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Game finalized</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-gray-900">Finished-game recap</h2>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              {playerCount ? `${playerCount} players` : "Final results"} · {formatCurrency(totalBoughtIn)} total pot
            </p>
          </div>
        </div>
      ) : (
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">Settlement summary</h2>
      )}

      {finalized ? (
        <section
          aria-labelledby="share-night-heading"
          className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-[#f1f3ef]"
        >
          <div className="grid items-center gap-6 p-5 sm:grid-cols-[minmax(0,1fr)_154px] sm:p-7">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-gray-700">
                Game card
              </div>
              <h3
                id="share-night-heading"
                className="mt-4 max-w-md text-2xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-3xl"
              >
                Post the receipts.
              </h3>
              <p className="mt-2 max-w-lg text-sm leading-6 text-gray-600">
                Pick anyone at the table, deal them a poker nickname, and share the result. Names and dollar amounts stay off until you add them.
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-gray-700">
                {topFinisher ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <Trophy aria-hidden size={14} className="text-emerald-700" />
                    {topFinisher.displayName} {formatSignedNet(topFinisher.net)}
                  </span>
                ) : null}
                <span className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  {playerCount ?? recapData.playerCount} players
                </span>
                <span className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  {formatCurrency(totalBoughtIn)} in play
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowGameRecap(true)}
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 text-sm font-semibold text-white transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 sm:w-auto"
              >
                Make a game card
                <ArrowUpRight aria-hidden size={17} />
              </button>
              <p className="mt-2 text-xs text-gray-500">Tap through 50 poker-table nicknames</p>
            </div>

            <button
              type="button"
              onClick={() => setShowGameRecap(true)}
              aria-label="Preview shareable game recap"
              className="group relative mx-auto hidden w-[138px] rotate-[2deg] rounded-[18px] text-left transition duration-200 hover:rotate-0 hover:-translate-y-1 focus-visible:rotate-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-4 sm:block"
            >
              <RecapStoryCard
                data={recapData}
                privacy={defaultRecapPrivacy}
                mode="summary"
                featuredPlayerId={topFinisher?.id}
                persona={previewPersona}
                decorative
              />
              <span className="absolute -bottom-3 -left-4 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-900 shadow-md">
                Tap to deal
              </span>
            </button>
          </div>
        </section>
      ) : null}

      <div className={finalized ? "mt-6" : "mt-3"}>
        {finalized ? (
          <h3 className="text-sm font-semibold text-gray-900">Settlement record</h3>
        ) : null}
        <pre className={`${finalized ? "mt-2" : ""} whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50/80 p-4 font-mono text-sm leading-6 text-gray-800`}>
          {summaryText}
        </pre>
      </div>

      {discrepancyAllocation && discrepancyAmount ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Discrepancy decision</p>
          <p className="mt-1">{formatCurrency(discrepancyAmount)} {discrepancyAllocation.method === "proportional" ? "split proportionally across eligible results." : "assigned to the selected eligible players."}</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          size="md"
          onClick={handleCopy}
          className="sm:flex-1"
        >
          <Copy aria-hidden size={16} /> Copy results
        </Button>
        <Button
          variant={finalized ? "secondary" : "primary"}
          size="md"
          onClick={handleShare}
          className="sm:flex-1"
        >
          <Share2 aria-hidden size={16} /> Share settlement
        </Button>
      </div>

      {finalized ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-900">What happens next</h3>
          <ol className="mt-2 space-y-1.5 text-sm leading-6 text-gray-600">
            <li>1. Make the payments shown above.</li>
            <li>2. Share the settlement so everyone has the same record.</li>
            <li>3. This page stays available at its link while the room is retained.</li>
          </ol>
        </div>
      ) : null}

      <Link
        href={`/create?name=${encodeURIComponent(game.name)}&buyin=${game.buy_in_amount}`}
        onClick={() => { if (isHost) trackProductOpsEvent("host.returned_to_create", {}, game.id); clearActiveGame(); }}
        className="mt-2 block"
      >
        <Button variant="ghost" size="md" fullWidth>
          <RefreshCw aria-hidden size={16} /> Play again
        </Button>
      </Link>

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
