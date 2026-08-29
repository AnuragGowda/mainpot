"use client";

import type { Game, GameStatus } from "@/lib/types";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/format";
import ConfirmButton from "./ConfirmButton";

export interface GameHeaderProps {
  game: Game;
  totalPot: number;
  playerCount: number;
  isLocalMode: boolean;
  isHost: boolean;
  onEndGame: () => void;
  ending: boolean;
}

const statusMeta: Record<GameStatus, { label: string; variant: "green" | "amber" | "gray" }> = {
  active: { label: "Active", variant: "green" },
  settling: { label: "Settling", variant: "amber" },
  ended: { label: "Ended", variant: "gray" },
};

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!ok) {
    throw new Error("Copy failed");
  }
}

export default function GameHeader({
  game,
  totalPot,
  playerCount,
  isLocalMode,
  isHost,
  onEndGame,
  ending,
}: GameHeaderProps) {
  const { toast } = useToast();

  async function handleCopy() {
    try {
      await copyText(game.code);
      toast("Copied!", "success");
    } catch {
      toast("Couldn't copy the room code.", "error");
    }
  }

  const status = statusMeta[game.status];

  return (
    <header className="pt-8 md:pt-12">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              {game.name}
            </h1>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500">Hosted by {game.host_name}</p>
        </div>
        {isHost ? (
          <div className="shrink-0">
            <ConfirmButton size="sm" onConfirm={onEndGame} loading={ending}>
              End game
            </ConfirmButton>
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
          Room code
        </p>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={handleCopy}
            aria-label={`Copy room code ${game.code}`}
            className="-mx-2 inline-flex min-h-[44px] items-center rounded-lg px-2 transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            <span className="font-mono text-3xl font-bold tracking-[0.2em] text-gray-900 sm:text-4xl">
              {game.code}
            </span>
          </button>
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            Copy
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
            Buy-in
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {formatCurrency(game.buy_in_amount)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
            Total pot
          </p>
          <p className="mt-1 text-lg font-semibold text-emerald-600">
            {formatCurrency(totalPot)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
            Players
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{playerCount}</p>
        </div>
      </div>

      {isLocalMode ? (
        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Single-device mode — connect Supabase for live multiplayer sync
        </div>
      ) : null}
    </header>
  );
}