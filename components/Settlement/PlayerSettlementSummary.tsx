"use client";

import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from "lucide-react";
import Card from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import { getPlayerTransfers } from "@/lib/settlement";
import type { Transfer } from "@/lib/settlement";
import type { SettlementMode } from "@/lib/payments";
import TransferList from "./TransferList";

export interface PlayerSettlementSummaryProps {
  transfers: Transfer[];
  gameId: string;
  mode: SettlementMode;
  currentPlayerId: string;
  finalized: boolean;
}

function totalAmount(transfers: Transfer[]): number {
  return transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
}

/** Player-first settlement instructions; the full table plan lives separately. */
export default function PlayerSettlementSummary({
  transfers,
  gameId,
  mode,
  currentPlayerId,
  finalized,
}: PlayerSettlementSummaryProps) {
  const { outgoing, incoming } = getPlayerTransfers(transfers, currentPlayerId);
  const outgoingTotal = totalAmount(outgoing);
  const incomingTotal = totalAmount(incoming);
  const square = outgoing.length === 0 && incoming.length === 0;

  return (
    <section aria-labelledby="your-settlement-heading" className="space-y-4">
      <Card
        padding="md"
        className={square ? "border-emerald-200 bg-emerald-50/50" : "border-gray-300"}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          {finalized ? "Your settlement" : "Settlement preview"}
        </p>
        <div className="mt-3 flex items-start gap-3">
          {outgoing.length > 0 ? (
            <ArrowUpRight aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          ) : incoming.length > 0 ? (
            <ArrowDownLeft aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          ) : (
            <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          )}
          <div>
            <h2 id="your-settlement-heading" className="text-lg font-semibold tracking-tight text-gray-950">
              {outgoing.length > 0
                ? `${finalized ? "You need to send" : "Preview: you would send"} ${formatCurrency(outgoingTotal)}.`
                : incoming.length > 0
                  ? `${finalized ? "You’re receiving" : "Preview: you would receive"} ${formatCurrency(incomingTotal)}.`
                  : finalized ? "You’re all square." : "Preview: you would be square."}
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-600">
              {!finalized
                ? "Waiting for the host to lock the final totals. Do not pay yet."
                : outgoing.length > 0
                ? "Your payment details are first. The complete table plan is available below."
                : incoming.length > 0
                  ? "You can track incoming payments here. The complete table plan is available below."
                  : "You don’t need to send or receive a payment for this settlement."}
            </p>
          </div>
        </div>
      </Card>

      {outgoing.length > 0 ? (
        <section aria-labelledby="payments-to-send-heading">
          <h3 id="payments-to-send-heading" className="mb-2 text-sm font-medium uppercase tracking-widest text-gray-500">
            Payments to send
          </h3>
          <TransferList
            transfers={outgoing}
            gameId={gameId}
            mode={mode}
            currentPlayerId={currentPlayerId}
            actionsEnabled={finalized}
          />
        </section>
      ) : null}

      {incoming.length > 0 ? (
        <section aria-labelledby="payments-to-receive-heading">
          <h3 id="payments-to-receive-heading" className="mb-2 text-sm font-medium uppercase tracking-widest text-gray-500">
            Payments to receive
          </h3>
          <TransferList
            transfers={incoming}
            gameId={gameId}
            mode={mode}
            currentPlayerId={currentPlayerId}
            actionsEnabled={finalized}
          />
        </section>
      ) : null}
    </section>
  );
}
