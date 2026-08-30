"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, QrCode, Share2, X } from "lucide-react";
import type { Game, GameStatus } from "@/lib/types";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";
import { formatCurrency } from "@/lib/format";
import ConfirmButton from "./ConfirmButton";
import FriendInviteList from "./FriendInviteList";

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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");

  useEffect(() => {
    setInviteUrl(`${window.location.origin}/game/${game.code}`);
  }, [game.code]);

  useEffect(() => {
    if (!inviteOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInviteOpen(false);
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [inviteOpen]);

  async function handleCopy() {
    try {
      await copyText(game.code);
      toast("Copied!", "success");
    } catch {
      toast("Couldn't copy the room code.", "error");
    }
  }

  async function handleShare() {
    const url = inviteUrl || `${window.location.origin}/game/${game.code}`;
    const text = `Join ${game.name} on Mainpot. Room code: ${game.code}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: game.name, text, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    try {
      await copyText(url);
      toast("Invite link copied", "success");
    } catch {
      toast("Couldn't copy the invite link.", "error");
    }
  }

  async function handleCopyLink() {
    const url = inviteUrl || `${window.location.origin}/game/${game.code}`;
    try {
      await copyText(url);
      toast("Invite link copied", "success");
    } catch {
      toast("Couldn't copy the invite link.", "error");
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
            <ConfirmButton variant="secondary" size="sm" onConfirm={onEndGame} loading={ending}>
              End game
            </ConfirmButton>
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
          Room code
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleCopy}
            aria-label={`Copy room code ${game.code}`}
            className="-mx-2 inline-flex min-h-[44px] items-center rounded-lg px-2 transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
          >
            <span className="font-mono text-3xl font-bold tracking-[0.2em] text-gray-900 sm:text-4xl">
              {game.code}
            </span>
          </button>
          <Button variant="secondary" size="sm" onClick={handleCopy} leftIcon={<Copy size={15} />}>
            Copy code
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setInviteOpen(true)} leftIcon={<QrCode size={15} />}>
            Invite
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 divide-x divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="px-3 py-4 sm:px-5">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
            Buy-in
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {formatCurrency(game.buy_in_amount)}
          </p>
        </div>
        <div className="px-3 py-4 sm:px-5">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
            Total pot
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-950">
            {formatCurrency(totalPot)}
          </p>
        </div>
        <div className="px-3 py-4 sm:px-5">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
            Players
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{playerCount}</p>
        </div>
      </div>

      {isLocalMode ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-amber-700">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Local mode · connect Supabase for live multiplayer
        </div>
      ) : null}

      {inviteOpen ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 grid place-items-end bg-gray-950/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setInviteOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-dialog-title"
            className="w-full rounded-t-2xl border border-gray-200 bg-white p-6 shadow-2xl sm:max-w-sm sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Invite players</p>
                <h2 id="invite-dialog-title" className="mt-1 text-xl font-semibold tracking-tight text-gray-950">
                  Scan to join {game.name}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close invite"
                onClick={() => setInviteOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-800"
              >
                <X aria-hidden size={18} />
              </button>
            </div>

            <div className="mx-auto mt-6 w-fit rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
              {inviteUrl ? (
                <QRCodeSVG
                  value={inviteUrl}
                  title={`QR code to join ${game.name}`}
                  size={196}
                  level="H"
                  marginSize={2}
                  bgColor="#ffffff"
                  fgColor="#111512"
                  imageSettings={{
                    src: "/icon.svg",
                    height: 36,
                    width: 36,
                    excavate: true,
                  }}
                />
              ) : (
                <div className="h-[196px] w-[196px] animate-pulse rounded-lg bg-gray-100" />
              )}
            </div>

            <div className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-widest text-gray-500">Room code</p>
              <p className="mt-1 font-mono text-xl font-semibold tracking-[0.24em] text-gray-950">{game.code}</p>
            </div>

            <p className="mt-3 text-center text-xs text-gray-500">
              Scan with your camera · no account required
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={handleCopyLink} leftIcon={<Copy size={16} />}>Copy link</Button>
              <Button onClick={handleShare} leftIcon={<Share2 size={16} />}>Share invite</Button>
            </div>
            <FriendInviteList gameId={game.id} isHost={isHost} />
          </div>
        </div>
      ) : null}
    </header>
  );
}
