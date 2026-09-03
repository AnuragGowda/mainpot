"use client";

import { CheckCircle2, Trophy } from "lucide-react";
import Card from "@/components/ui/Card";
import { formatCurrency, formatSignedNet, round2 } from "@/lib/format";
import { getPlayerTransfers } from "@/lib/settlement";
import type { Transfer } from "@/lib/settlement";
import type { SettlementMode } from "@/lib/payments";
import TransferList from "./TransferList";

export interface PlayerSettlementSummaryProps {
  transfers: Transfer[];
  gameId: string;
  mode: SettlementMode;
  currentPlayerId: string;
  beforeDiscrepancyNet?: number;
  finalNet?: number;
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
  beforeDiscrepancyNet,
  finalNet,
}: PlayerSettlementSummaryProps) {
  const { outgoing, incoming } = getPlayerTransfers(transfers, currentPlayerId);
  const outgoingTotal = totalAmount(outgoing);
  const incomingTotal = totalAmount(incoming);

  const owesPayment = outgoing.length > 0;
  const isUp = !owesPayment && incomingTotal > 0;
  const resultBeforeDiscrepancy = beforeDiscrepancyNet ?? finalNet ?? 0;
  const finalResult = finalNet ?? resultBeforeDiscrepancy;
  const discrepancyAdjustment = round2(finalResult - resultBeforeDiscrepancy);
  const showDiscrepancyAdjustment = Math.abs(discrepancyAdjustment) >= 0.005;

  return (
    <section aria-labelledby="your-settlement-heading" className="space-y-4">
      <Card
        padding="sm"
        className={owesPayment ? "border-gray-300 bg-gray-50/60" : isUp ? "border-emerald-200 bg-emerald-50/50" : "border-gray-300"}
      >
        {owesPayment ? (
          <>
            <h2 id="your-settlement-heading" className="text-lg font-semibold tracking-tight text-gray-950">
              You owe {formatCurrency(outgoingTotal)}.
            </h2>
            <p className="mt-0.5 text-sm leading-5 text-gray-600">
              Send each payment below, then mark it sent so the table can keep track.
            </p>
          </>
        ) : isUp ? (
          <div className="flex items-center gap-2.5 whitespace-nowrap">
            <Trophy aria-hidden className="h-5 w-5 shrink-0 text-gray-950" />
            <h2 id="your-settlement-heading" className="text-lg font-semibold tracking-tight text-gray-950">
              You&apos;re up {formatCurrency(incomingTotal)}.
            </h2>
            <p className="text-sm leading-5 text-gray-600">No payment needed.</p>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <CheckCircle2 aria-hidden className="h-5 w-5 shrink-0 text-emerald-700" />
            <div>
              <h2 id="your-settlement-heading" className="text-lg font-semibold tracking-tight text-gray-950">You&apos;re even.</h2>
              <p className="mt-0.5 text-sm leading-5 text-gray-600">No payment needed.</p>
            </div>
          </div>
        )}
        {showDiscrepancyAdjustment ? (
          <p className="mt-2 border-t border-gray-200 pt-2 text-sm text-gray-500">
            <span className="font-semibold tabular-nums text-gray-950">{formatSignedNet(discrepancyAdjustment)}</span>
            {" discrepancy adjustment · was "}
            <span className="tabular-nums text-gray-700">{formatSignedNet(resultBeforeDiscrepancy)}</span>
          </p>
        ) : null}
        {owesPayment ? <div className="mt-4">
          <TransferList
            transfers={outgoing}
            gameId={gameId}
            mode={mode}
            currentPlayerId={currentPlayerId}
            actionsEnabled
            personalOutgoing
          />
        </div> : null}
      </Card>
    </section>
  );
}
