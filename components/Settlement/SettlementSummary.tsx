"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Copy,
  RefreshCw,
  Share2,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";
import { formatCurrency } from "@/lib/format";
import { defaultRecapPrivacy, deriveRecapData } from "@/lib/recap";
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
  presentation?: "card" | "record";
  discrepancyAllocation?: DiscrepancyAllocation | null;
  discrepancyAmount?: number;
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
        <button
          type="button"
          onClick={() => setShowGameRecap(true)}
          aria-label="Open shareable game card"
          className="mx-auto block w-full max-w-[320px] rounded-[18px] text-left transition duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-4"
        >
          <RecapStoryCard
            data={recapData}
            privacy={defaultRecapPrivacy}
            mode="summary"
            featuredPlayerId={topFinisher?.id}
            decorative
          />
        </button>
        {showGameRecap ? <GameRecapDialog snapshot={snapshot} nets={nets} transfers={transfers} onClose={() => setShowGameRecap(false)} /> : null}
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
