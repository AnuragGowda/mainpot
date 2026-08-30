"use client";

import Link from "next/link";
import { Copy, RefreshCw, Share2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";
import { clearActiveGame } from "@/lib/session";
import { buildSummaryText } from "@/lib/summary";
import type { PlayerNet, Transfer } from "@/lib/settlement";
import type { Game } from "@/lib/types";

export interface SettlementSummaryProps {
  game: Game;
  transfers: Transfer[];
  nets: PlayerNet[];
  mode: "min" | "bank";
  bankName?: string;
  totalBoughtIn: number;
}

/**
 * Settlement summary card: plain-text recap plus Copy / Share / New game.
 */
export default function SettlementSummary({
  game,
  transfers,
  nets,
  mode,
  bankName,
  totalBoughtIn,
}: SettlementSummaryProps) {
  const { toast } = useToast();

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
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Ante settlement", text: summaryText });
      } catch (err) {
        // User cancelled the share sheet — nothing to do.
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        await copyFallback();
      }
      return;
    }
    await copyFallback();
  }

  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold tracking-tight text-gray-900">
        Settlement summary
      </h2>

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
          <Copy aria-hidden size={16} /> Copy summary
        </Button>
        <Button size="md" onClick={handleShare} className="sm:flex-1">
          <Share2 aria-hidden size={16} /> Share
        </Button>
      </div>

      <Link
        href={`/create?name=${encodeURIComponent(game.name)}&buyin=${game.buy_in_amount}`}
        onClick={() => clearActiveGame()}
        className="mt-2 block"
      >
        <Button variant="ghost" size="md" fullWidth>
          <RefreshCw aria-hidden size={16} /> Play again
        </Button>
      </Link>
    </Card>
  );
}
