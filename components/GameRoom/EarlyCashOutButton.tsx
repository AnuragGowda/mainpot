"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { formatCurrency, formatSignedNet, round2 } from "@/lib/format";
import { playerVerifiedInvested } from "@/lib/game";
import { calculateEarlyCashOutNet } from "@/lib/settlement";
import type { GameSnapshot } from "@/lib/types";

interface EarlyCashOutButtonProps {
  snapshot: GameSnapshot;
  currentPlayerId: string;
  leaving: boolean;
  onRequest: (amount: number) => Promise<boolean>;
  onLeaveWithoutCashOut: () => void;
}

type SheetMode = "cash-out" | "leave-later";

/** Player-facing early-exit sheet with an explicit settle-later escape hatch. */
export default function EarlyCashOutButton({
  snapshot,
  currentPlayerId,
  leaving,
  onRequest,
  onLeaveWithoutCashOut,
}: EarlyCashOutButtonProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SheetMode>("cash-out");
  const [amount, setAmount] = useState("");
  const [requesting, setRequesting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const player = snapshot.players.find((item) => item.id === currentPlayerId);
  const pendingEntries = snapshot.buyIns.filter(
    (buyIn) => !buyIn.verified
      && (buyIn.player_id === currentPlayerId || buyIn.fronted_by_player_id === currentPlayerId)
  );
  const parsedAmount = round2(Number(amount));
  const amountValid = amount.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount >= 0;
  const net = amountValid
    ? calculateEarlyCashOutNet(snapshot.buyIns, currentPlayerId, parsedAmount)
    : null;
  const verifiedInvested = playerVerifiedInvested(snapshot, currentPlayerId);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const triggerElement = triggerRef.current;
    document.body.style.overflow = "hidden";
    // The amount input autofocuses. Never move focus away from someone who
    // has already started editing while the dialog's effects are running.
    if (!dialogRef.current?.contains(document.activeElement)) cancelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => {
        if (!dialogRef.current?.isConnected) triggerElement?.focus();
      });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !requesting && !leaving) {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [leaving, open, requesting]);

  async function submitRequest() {
    if (!amountValid || pendingEntries.length) return;
    setRequesting(true);
    try {
      if (await onRequest(parsedAmount)) setOpen(false);
    } finally {
      setRequesting(false);
    }
  }

  if (!player) return null;

  return (
    <>
      <Button
        ref={triggerRef}
        variant="secondary"
        className="flex-none"
        onClick={() => {
          setMode("cash-out");
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Cash out
      </Button>
      {open
        ? createPortal(
            <div
              role="presentation"
              className="fixed inset-0 z-[70] flex items-end justify-center bg-gray-950/45 backdrop-blur-sm sm:items-center sm:p-4"
              onMouseDown={(event) => {
                if (event.currentTarget === event.target && !requesting && !leaving) setOpen(false);
              }}
            >
              <div
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                className="w-full rounded-t-2xl border border-gray-200 bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl focus:outline-none sm:max-w-md sm:rounded-2xl sm:p-6"
              >
                {mode === "cash-out" ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Early cash-out</p>
                    <h2 id={titleId} className="mt-1 text-xl font-semibold tracking-tight text-gray-950">Cash out &amp; leave</h2>
                    <p id={descriptionId} className="mt-2 text-sm leading-6 text-gray-600">
                      Enter your final chip value. {snapshot.game.host_name} will review it, then Mainpot will show the one payment between you.
                    </p>
                    <label className="mt-5 block text-sm font-medium text-gray-900">
                      Final chips
                      <Input
                        className="mt-1.5"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        pattern="[0-9]*[.]?[0-9]*"
                        prefix="$"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="0.00"
                        aria-label="Final chips for early cash-out"
                        autoFocus
                        disabled={requesting}
                      />
                    </label>
                    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                      <div className="flex justify-between gap-4 text-gray-600">
                        <span>Host-confirmed buy-ins</span>
                        <span className="font-medium tabular-nums text-gray-900">{formatCurrency(verifiedInvested)}</span>
                      </div>
                      {net != null ? (
                        <div className="mt-2 flex justify-between gap-4 border-t border-gray-200 pt-2">
                          <span className="font-medium text-gray-900">Your locked result</span>
                          <span className="font-semibold tabular-nums text-gray-950">{formatSignedNet(net)}</span>
                        </div>
                      ) : null}
                      {net != null ? (
                        <p className="mt-2 text-xs leading-5 text-gray-500">
                          {net > 0.005
                            ? `${snapshot.game.host_name} will pay you ${formatCurrency(net)}.`
                            : net < -0.005
                              ? `You will pay ${snapshot.game.host_name} ${formatCurrency(Math.abs(net))}.`
                              : "No payment will be needed."}
                        </p>
                      ) : null}
                    </div>
                    {pendingEntries.length ? (
                      <p role="alert" className="mt-3 text-sm leading-6 text-amber-800">
                        Ask the host to resolve {pendingEntries.length} pending {pendingEntries.length === 1 ? "buy-in" : "buy-ins"} involving you first.
                      </p>
                    ) : null}
                    <div className="mt-6 grid gap-2 sm:grid-cols-2">
                      <Button
                        fullWidth
                        loading={requesting}
                        disabled={!amountValid || pendingEntries.length > 0}
                        onClick={() => void submitRequest()}
                        className="sm:order-2"
                      >
                        Send to host
                      </Button>
                      <Button ref={cancelRef} fullWidth variant="secondary" disabled={requesting} onClick={() => setOpen(false)} className="sm:order-1">
                        Cancel
                      </Button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMode("leave-later")}
                      className="mt-4 min-h-11 w-full rounded-lg text-sm font-medium text-gray-500 underline decoration-gray-300 underline-offset-4 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950"
                    >
                      Leave now and settle when the game ends
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Settle later</p>
                    <h2 id={titleId} className="mt-1 text-xl font-semibold tracking-tight text-gray-950">Leave without cashing out?</h2>
                    <p id={descriptionId} className="mt-2 text-sm leading-6 text-gray-600">
                      Your buy-ins stay in the ledger. You cannot add more, and the host must enter your final chips when the game ends.
                    </p>
                    <div className="mt-6 grid gap-2 sm:grid-cols-2">
                      <Button fullWidth variant="danger" loading={leaving} onClick={() => onLeaveWithoutCashOut()} className="sm:order-2">
                        Leave &amp; settle later
                      </Button>
                      <Button ref={cancelRef} fullWidth variant="secondary" disabled={leaving} onClick={() => setMode("cash-out")} className="sm:order-1">
                        Back
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
