"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, RefreshCw, Share2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";
import { formatCurrency } from "@/lib/format";
import { clearActiveGame } from "@/lib/session";
import { trackProductOpsEvent } from "@/lib/product-ops";
import { buildSummaryText } from "@/lib/summary";
import type { PlayerNet, Transfer } from "@/lib/settlement";
import type { Game, GameSnapshot } from "@/lib/types";
import GameRecapDialog from "./GameRecapDialog";

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
  });

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

      <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50/80 p-4 font-mono text-sm leading-6 text-gray-800">
        {summaryText}
      </pre>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          size="md"
          onClick={handleCopy}
          className="sm:flex-1"
        >
          <Copy aria-hidden size={16} /> Copy recap
        </Button>
        <Button size="md" onClick={handleShare} className="sm:flex-1">
          <Share2 aria-hidden size={16} /> Share recap
        </Button>
      </div>

      {finalized ? (
        <Button
          size="md"
          fullWidth
          className="mt-2"
          onClick={() => setShowGameRecap(true)}
        >
          <Share2 aria-hidden size={16} /> Create shareable game recap
        </Button>
      ) : null}

      {finalized ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-900">What happens next</h3>
          <ol className="mt-2 space-y-1.5 text-sm leading-6 text-gray-600">
            <li>1. Make the payments shown above.</li>
            <li>2. Share this recap with the table so everyone has the same record.</li>
            <li>3. This page stays available at its link while the room is retained.</li>
          </ol>
        </div>
      ) : null}

      <Link
        href={`/create?name=${encodeURIComponent(game.name)}&buyin=${game.buy_in_amount}`}
        onClick={() => { if (isHost) trackProductOpsEvent("host.returned_to_create"); clearActiveGame(); }}
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
