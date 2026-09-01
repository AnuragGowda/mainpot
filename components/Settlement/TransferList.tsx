"use client";

import { Circle, CircleCheck, Copy, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
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
import type { Transfer } from "@/lib/settlement";

export interface TransferListProps {
  transfers: Transfer[];
  gameId: string;
  mode: SettlementMode;
  onStatusChange?: (mode: SettlementMode, settledKeys: Set<string>) => void;
}

function PartyName({ name }: { name: string }) {
  if (name === "Bank") return <Badge variant="gray">Bank</Badge>;
  return <span className="font-medium text-gray-900">{name}</span>;
}

export default function TransferList({ transfers, gameId, mode, onStatusChange }: TransferListProps) {
  const { toast } = useToast();
  const [settledKeys, setSettledKeys] = useState<Set<string>>(new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [paymentHandles, setPaymentHandles] = useState<Map<string, PlayerPaymentHandles>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getSettlementPaymentStatuses(gameId)
        .then((statuses) => {
          if (!cancelled) {
            const next = new Set(statuses.filter((item) => item.settled).map((item) => item.key));
            setSettledKeys(next);
            onStatusChange?.(mode, next);
          }
        })
        .catch(() => undefined);
    };
    refresh();
    const supabase = getBrowserSupabase();
    const channel = supabase
      ?.channel(`settlement-payments-${gameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "settlement_payments", filter: `game_id=eq.${gameId}` }, refresh)
      .subscribe();
    return () => {
      cancelled = true;
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [gameId, mode, onStatusChange]);

  useEffect(() => {
    let cancelled = false;
    const recipientIds = transfers
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
  }, [transfers]);

  if (!transfers.length) return <p className="text-sm text-gray-500">No transfers needed — everyone is square.</p>;

  return (
    <Card padding="none">
      <ul className="divide-y divide-gray-100">
        {transfers.map((transfer) => {
          const key = settlementPaymentKey(mode, transfer);
          const settled = settledKeys.has(key);
          const handles = transfer.toPlayerId ? paymentHandles.get(transfer.toPlayerId) : undefined;
          const venmoUrl = handles?.venmo
            ? buildVenmoPaymentUrl(handles.venmo, transfer.amount)
            : null;
          const zelleText = handles?.zelle
            ? buildZellePaymentText(handles.zelle, transfer.amount)
            : null;
          return (
            <li key={key} className={`flex flex-col gap-3 px-4 py-3 transition sm:flex-row sm:items-center sm:justify-between ${settled ? "bg-emerald-50/60" : ""}`}>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <PartyName name={transfer.from} />
                <span className="text-gray-500">pays</span>
                <PartyName name={transfer.to} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                <span className={`font-semibold ${settled ? "text-emerald-800" : "text-gray-900"}`}>{formatCurrency(transfer.amount)}</span>
                {!settled && venmoUrl ? (
                  <a
                    href={venmoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:text-gray-950 sm:h-9"
                  >
                    Venmo <ExternalLink aria-hidden size={14} />
                  </a>
                ) : null}
                {!settled && zelleText ? (
                  <a
                    href="https://www.zellepay.com/get-started"
                    target="_blank"
                    rel="noreferrer"
                    title="Copy payment details and open Zelle's bank finder"
                    onClick={() => {
                      void copyText(zelleText)
                        .then(() => toast("Zelle details copied", "success"))
                        .catch(() => toast("Could not copy Zelle details", "error"));
                    }}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:text-gray-950 sm:h-9"
                  >
                    Zelle <Copy aria-hidden size={14} />
                  </a>
                ) : null}
                <button
                  type="button"
                  disabled={busyKey === key}
                  aria-pressed={settled}
                  onClick={async () => {
                    setBusyKey(key);
                    try {
                      await setSettlementPaymentStatus(gameId, mode, transfer, !settled);
                      const next = new Set(settledKeys);
                      if (settled) next.delete(key); else next.add(key);
                      setSettledKeys(next);
                      onStatusChange?.(mode, next);
                      toast(settled ? "Payment reopened" : "Payment marked paid", "success");
                    } catch (error) {
                      toast(error instanceof Error ? error.message : "Could not update payment.", "error");
                    } finally {
                      setBusyKey(null);
                    }
                  }}
                  className={`inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 disabled:opacity-50 sm:h-9 ${settled ? "text-emerald-800 hover:bg-emerald-100" : "text-gray-500 hover:bg-gray-100 hover:text-gray-950"}`}
                >
                  {settled ? <CircleCheck aria-hidden size={17} /> : <Circle aria-hidden size={17} />}
                  {settled ? "Paid" : "Mark paid"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
