"use client";

import { Check, Copy, ExternalLink, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";
import { formatCurrency } from "@/lib/format";
import {
  buildVenmoPaymentUrl,
  buildZellePaymentText,
  getPlayerPaymentHandles,
} from "@/lib/payment-links";
import type { PlayerPaymentHandles } from "@/lib/payment-links";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { getSettlementPaymentStatuses, setSettlementPaymentStatus, settlementPaymentKey } from "@/lib/payments";
import type { SettlementMode } from "@/lib/payments";
import { isPlayerInTransfer } from "@/lib/settlement";
import type { Transfer } from "@/lib/settlement";

export interface TransferListProps {
  transfers: Transfer[];
  gameId: string;
  mode: SettlementMode;
  currentPlayerId?: string | null;
  isHost?: boolean;
  actionsEnabled?: boolean;
  /** Compact sender-facing wording for a player's own outgoing payments. */
  personalOutgoing?: boolean;
}

function PartyName({ name }: { name: string }) {
  if (name === "Bank") return <Badge variant="gray">Bank</Badge>;
  return <span className="font-medium text-gray-900">{name}</span>;
}

interface PaymentDetails {
  recipient: string;
  amount: number;
  venmoUrl: string | null;
  zelleText: string | null;
}

function PaymentDetailsDialog({ details, onClose }: { details: PaymentDetails; onClose: () => void }) {
  const { toast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const zelleText = details.zelleText;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) {
      event.preventDefault();
      return;
    }
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

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-gray-950/45 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
        className="w-full rounded-t-2xl border border-gray-200 bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl focus:outline-none sm:max-w-sm sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Send payment</p>
            <h2 id={titleId} className="mt-1 text-xl font-semibold tracking-tight text-gray-950">{details.recipient}</h2>
            <p id={descriptionId} className="mt-1 text-sm text-gray-600">{formatCurrency(details.amount)} due</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close payment details" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950">
            <X aria-hidden size={20} />
          </button>
        </div>
        <div className="mt-5 grid gap-2">
          {details.venmoUrl ? (
            <a href={details.venmoUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#008CFF] px-4 text-sm font-semibold text-white transition hover:bg-[#007be0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2">
              Pay with Venmo <ExternalLink aria-hidden size={16} />
            </a>
          ) : null}
          {zelleText ? (
            <Button variant="secondary" fullWidth onClick={() => {
              void copyText(zelleText)
                .then(() => toast("Zelle details copied", "success"))
                .catch(() => toast("Could not copy Zelle details", "error"));
            }} leftIcon={<Copy aria-hidden size={16} />}>
              Copy Zelle details
            </Button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function TransferList({
  transfers,
  gameId,
  mode,
  currentPlayerId = null,
  isHost = false,
  actionsEnabled = true,
  personalOutgoing = false,
}: TransferListProps) {
  const { toast } = useToast();
  const channelId = useId().replaceAll(":", "");
  const [settledKeys, setSettledKeys] = useState<Set<string>>(new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [paymentHandles, setPaymentHandles] = useState<Map<string, PlayerPaymentHandles>>(new Map());
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);

  useEffect(() => {
    if (!actionsEnabled) {
      setSettledKeys(new Set());
      return;
    }
    let cancelled = false;
    const refresh = () => {
      void getSettlementPaymentStatuses(gameId)
        .then((statuses) => {
          if (!cancelled) {
            const next = new Set(statuses.filter((item) => item.settled).map((item) => item.key));
            setSettledKeys(next);
          }
        })
        .catch(() => undefined);
    };
    refresh();
    const supabase = getBrowserSupabase();
    const channel = supabase
      ?.channel(`settlement-payments-${gameId}-${mode}-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "settlement_payments", filter: `game_id=eq.${gameId}` }, refresh)
      .subscribe((status) => {
        // A payment can be recorded after the initial read but before the
        // channel is ready. Reconcile once subscribed so that update cannot be
        // missed permanently.
        if (status === "SUBSCRIBED") refresh();
      });
    return () => {
      cancelled = true;
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [actionsEnabled, channelId, gameId, mode]);

  useEffect(() => {
    if (!actionsEnabled) {
      setPaymentHandles(new Map());
      return;
    }
    let cancelled = false;
    const recipientIds = transfers
      .filter((transfer) => isHost || transfer.fromPlayerId === currentPlayerId)
      .map((transfer) => transfer.toPlayerId)
      .filter((id): id is string => Boolean(id));
    void getPlayerPaymentHandles(recipientIds)
      .then((handles) => {
        if (!cancelled) setPaymentHandles(handles);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [actionsEnabled, currentPlayerId, isHost, transfers]);

  if (!transfers.length) return <p className="text-sm text-gray-500">No transfers needed — everyone is square.</p>;

  return (
    <Card padding="none">
      <ul className="divide-y divide-gray-100">
        {transfers.map((transfer) => {
          const key = settlementPaymentKey(mode, transfer);
          const settled = settledKeys.has(key);
          const canManage = actionsEnabled && (isHost || isPlayerInTransfer(transfer, currentPlayerId));
          const canUsePaymentShortcut = actionsEnabled && (isHost || transfer.fromPlayerId === currentPlayerId);
          const handles = transfer.toPlayerId ? paymentHandles.get(transfer.toPlayerId) : undefined;
          const venmoUrl = canUsePaymentShortcut && handles?.venmo
            ? buildVenmoPaymentUrl(handles.venmo, transfer.amount)
            : null;
          const zelleText = canUsePaymentShortcut && handles?.zelle
            ? buildZellePaymentText(handles.zelle, transfer.amount)
            : null;
          return (
            <li key={key} className="flex items-center gap-3 px-4 py-3">
              {canManage ? (
                <label
                  className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg transition hover:bg-gray-100 focus-within:ring-2 focus-within:ring-gray-950 focus-within:ring-offset-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
                  title={settled ? "Reopen payment" : "Mark sent"}
                >
                  <input
                    type="checkbox"
                    checked={settled}
                    disabled={busyKey === key}
                    aria-label="Mark sent"
                    onChange={async () => {
                        setBusyKey(key);
                        try {
                          await setSettlementPaymentStatus(gameId, mode, transfer, !settled);
                          const next = new Set(settledKeys);
                          if (settled) next.delete(key); else next.add(key);
                          setSettledKeys(next);
                          toast(settled ? "Payment reopened" : "Payment marked paid", "success");
                        } catch (error) {
                          toast(error instanceof Error ? error.message : "Could not update payment.", "error");
                        } finally {
                          setBusyKey(null);
                        }
                    }}
                    className="peer sr-only"
                  />
                  <span className="grid h-5 w-5 place-items-center rounded-md border border-gray-300 bg-white text-transparent shadow-sm transition duration-150 peer-checked:border-gray-950 peer-checked:bg-gray-950 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-gray-950 peer-focus-visible:ring-offset-2">
                    <Check aria-hidden size={14} strokeWidth={3} />
                  </span>
                </label>
              ) : (
                <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${settled ? "border-gray-950 bg-gray-950 text-white" : "border-gray-300 bg-white"}`}>
                  {settled ? <Check size={14} strokeWidth={3} /> : null}
                </span>
              )}
              {canUsePaymentShortcut && (venmoUrl || zelleText) ? (
                <button type="button" onClick={() => setPaymentDetails({ recipient: transfer.to, amount: transfer.amount, venmoUrl, zelleText })} className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-lg px-1 py-1 text-left transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950">
                  <span className={`truncate font-medium ${settled ? "text-gray-500 line-through decoration-gray-300" : "text-gray-900"}`}>{personalOutgoing ? transfer.to : `${transfer.from} → ${transfer.to}`}</span>
                  <span className={`shrink-0 font-semibold tabular-nums ${settled ? "text-gray-500 line-through decoration-gray-300" : "text-gray-900"}`}>{formatCurrency(transfer.amount)}</span>
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-center justify-between gap-4 px-1 py-1">
                  <span className={`truncate font-medium ${settled ? "text-gray-500 line-through decoration-gray-300" : "text-gray-900"}`}>{personalOutgoing ? transfer.to : <><PartyName name={transfer.from} /> <span className="text-gray-500">→</span> <PartyName name={transfer.to} /></>}</span>
                  <span className={`shrink-0 font-semibold tabular-nums ${settled ? "text-gray-500 line-through decoration-gray-300" : "text-gray-900"}`}>{formatCurrency(transfer.amount)}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {paymentDetails ? <PaymentDetailsDialog details={paymentDetails} onClose={() => setPaymentDetails(null)} /> : null}
    </Card>
  );
}
