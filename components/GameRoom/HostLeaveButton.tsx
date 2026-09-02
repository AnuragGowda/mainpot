"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Player } from "@/lib/types";
import Button from "@/components/ui/Button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";

interface HostLeaveButtonProps {
  players: Player[];
  currentPlayerId: string;
  leaving: boolean;
  onConfirm: (nextHostId: string) => void;
}

/** Requires an active successor before the current host can leave an active table. */
export default function HostLeaveButton({
  players,
  currentPlayerId,
  leaving,
  onConfirm,
}: HostLeaveButtonProps) {
  const candidates = players.filter(
    (player) => player.id !== currentPlayerId && !player.left_at,
  );
  const [open, setOpen] = useState(false);
  const [nextHostId, setNextHostId] = useState(candidates[0]?.id ?? "");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const validNextHostId = candidates.some((player) => player.id === nextHostId)
    ? nextHostId
    : (candidates[0]?.id ?? "");

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const triggerElement = triggerRef.current;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus());
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !leaving) {
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
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.requestAnimationFrame(() => triggerElement?.focus());
    };
  }, [leaving, open]);

  if (!candidates.length) {
    return (
      <Button variant="ghost" className="flex-none text-red-600 hover:bg-red-50" disabled>
        Leave
      </Button>
    );
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        className="flex-none text-red-600 hover:bg-red-50"
        onClick={() => setOpen(true)}
        aria-label="Leave the game"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Leave
      </Button>
      {open
        ? createPortal(
            <div
              role="presentation"
              className="fixed inset-0 z-[70] flex items-end justify-center bg-gray-950/45 backdrop-blur-sm sm:items-center sm:p-4"
              onMouseDown={(event) => {
                if (event.currentTarget === event.target && !leaving) setOpen(false);
              }}
            >
              <div
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                className="w-full rounded-t-2xl border border-gray-200 bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl focus:outline-none sm:max-w-sm sm:rounded-2xl sm:p-6"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Before you leave</p>
                <h2 id={titleId} className="mt-1 text-xl font-semibold tracking-tight text-gray-950">Choose the next host</h2>
                <p id={descriptionId} className="mt-2 text-sm leading-6 text-gray-600">
                  An active player must take over the ledger and end-game controls before you leave.
                </p>
                <label htmlFor="leaving-next-host" className="mt-5 mb-1.5 block text-sm font-medium text-gray-900">New host</label>
                <Select value={validNextHostId} onValueChange={setNextHostId}>
                  <SelectTrigger id="leaving-next-host" className="h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {candidates.map((player) => <SelectItem key={player.id} value={player.id}>{player.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  <Button
                    fullWidth
                    variant="danger"
                    loading={leaving}
                    disabled={!validNextHostId}
                    onClick={() => onConfirm(validNextHostId)}
                    className="sm:order-2"
                  >
                    Transfer & leave
                  </Button>
                  <Button
                    ref={cancelRef}
                    fullWidth
                    variant="secondary"
                    disabled={leaving}
                    onClick={() => setOpen(false)}
                    className="sm:order-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
