"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, X } from "lucide-react";
import type { Game, GameStatus } from "@/lib/types";
import Badge from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";
import { formatCurrency } from "@/lib/format";
import ConfirmButton from "./ConfirmButton";
import FriendInviteList from "./FriendInviteList";
import Button from "@/components/ui/Button";

export interface GameHeaderProps {
  game: Game;
  verifiedPot: number;
  pendingPot: number;
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
  verifiedPot,
  pendingPot,
  playerCount,
  isLocalMode,
  isHost,
  onEndGame,
  ending,
}: GameHeaderProps) {
  const { toast } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const inviteDialogRef = useRef<HTMLDivElement>(null);
  const inviteTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setInviteUrl(`${window.location.origin}/game/${game.code}`);
  }, [game.code]);

  useEffect(() => {
    if (!inviteOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    const fallbackFocus = inviteTriggerRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setInviteOpen(false);
        return;
      }
      if (event.key !== "Tab" || !inviteDialogRef.current) return;
      const focusable = inviteDialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => inviteDialogRef.current?.querySelector<HTMLElement>("button")?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      requestAnimationFrame(() => previousFocus?.focus?.() ?? fallbackFocus?.focus());
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

  const status = statusMeta[game.status];

  return (
    <header className="pt-8 md:pt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-gray-900" title={game.name}>
              {game.name}
            </h1>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <p className="mt-1 truncate text-sm text-gray-500" title={`Hosted by ${game.host_name}`}>
            Hosted by {game.host_name}
          </p>
        </div>

        <div className="w-full sm:w-auto sm:shrink-0">
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              ref={inviteTriggerRef}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setInviteOpen(true)}
              aria-label="Invite players"
              className="flex-1 sm:flex-none"
              leftIcon={<QrCode aria-hidden size={18} />}
            >
              Invite
            </Button>
            {isHost ? (
              <ConfirmButton
                variant="dangerOutline"
                size="sm"
                confirmationTitle="End the game?"
                confirmationDescription="This stops new buy-ins and moves everyone to cash-out entry."
                confirmLabel="Start cash-outs"
                onConfirm={onEndGame}
                loading={ending}
                disabled={pendingPot > 0}
                className="flex-1 sm:flex-none"
              >
                End game
              </ConfirmButton>
            ) : null}
          </div>
          {isHost && pendingPot > 0 ? (
            <p className="mt-1 text-xs leading-4 text-amber-700 sm:max-w-40 sm:text-right">Resolve pending entries first</p>
          ) : null}
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
            Pot
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-950">
            {formatCurrency(verifiedPot)}
          </p>
          {pendingPot > 0 ? (
            <p className="mt-0.5 text-xs font-medium text-amber-700">
              (+{formatCurrency(pendingPot)})
            </p>
          ) : null}
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
          Saved on this device · live sync is off
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
            ref={inviteDialogRef}
            aria-modal="true"
            aria-labelledby="invite-dialog-title"
            className="max-h-[100dvh] w-full overflow-y-auto overscroll-contain rounded-t-2xl border border-gray-200 bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:max-w-sm sm:rounded-2xl sm:pb-6"
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
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950"
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

            <FriendInviteList gameId={game.id} isHost={isHost} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={handleCopy} className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950">Copy code</button>
              <button type="button" onClick={handleShare} className="rounded-lg bg-gray-950 px-3 py-2.5 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2">Share invite</button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
