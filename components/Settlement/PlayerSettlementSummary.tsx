"use client";

import { CheckCircle2, Trophy } from "lucide-react";
import Card from "@/components/ui/Card";
import { formatCurrency, formatSignedNet, round2 } from "@/lib/format";
import { getPlayerPaymentTransfers } from "@/lib/settlement";
import type { SettlementPaymentTransfer } from "@/lib/settlement";
import { settlementPaymentKey } from "@/lib/payments";
import type { SettlementPaymentStatusState } from "@/lib/use-settlement-payment-status";
import PaymentStatusNotice from "./PaymentStatusNotice";
import TransferList from "./TransferList";

export interface PlayerSettlementSummaryProps {
  payments: SettlementPaymentTransfer[];
  gameId: string;
  currentPlayerId: string;
  beforeDiscrepancyNet?: number;
  finalNet?: number;
  paymentStatus: SettlementPaymentStatusState;
}

function totalAmount(payments: SettlementPaymentTransfer[]): number {
  return payments.reduce((sum, { transfer }) => sum + transfer.amount, 0);
}

function paymentLabel(payment: SettlementPaymentTransfer): string {
  return payment.mode === "early_exit" ? "Early cash-out" : "Final settlement";
}

function PaymentGroups({ payments, gameId, currentPlayerId, direction, paymentStatus }: {
  payments: SettlementPaymentTransfer[];
  gameId: string;
  currentPlayerId: string;
  direction: "outgoing" | "incoming";
  paymentStatus: SettlementPaymentStatusState;
}) {
  const grouped = [
    ...payments
      .filter((payment) => payment.mode === "early_exit")
      .map((payment, index) => ({
        key: `early-exit-${payment.earlyCashOut?.id ?? index}`,
        mode: "early_exit" as const,
        payments: [payment],
      })),
    ...(["min", "bank"] as const)
      .map((mode) => ({
        key: mode,
        mode,
        payments: payments.filter((payment) => payment.mode === mode),
      }))
      .filter(({ payments: items }) => items.length > 0),
  ];
  const showLabels = grouped.length > 1 || grouped[0]?.mode === "early_exit";

  return grouped.map(({ key, mode, payments: items }) => (
    <div key={key} className="mt-3 first:mt-0">
      {showLabels ? (
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
          {paymentLabel(items[0])}
        </p>
      ) : null}
      <TransferList
        transfers={items.map(({ transfer }) => transfer)}
        gameId={gameId}
        mode={mode}
        currentPlayerId={currentPlayerId}
        actionsEnabled
        personalOutgoing={direction === "outgoing"}
        personalIncoming={direction === "incoming"}
        earlyCashOut={items[0].earlyCashOut}
        paymentStatus={paymentStatus}
      />
    </div>
  ));
}

/** Player-first instructions across both final settlement and early exits. */
export default function PlayerSettlementSummary({
  payments,
  gameId,
  currentPlayerId,
  beforeDiscrepancyNet,
  finalNet,
  paymentStatus,
}: PlayerSettlementSummaryProps) {
  const { outgoing, incoming } = getPlayerPaymentTransfers(payments, currentPlayerId);
  const outstandingOutgoing = outgoing.filter(({ mode, transfer }) => !paymentStatus.settledKeys.has(settlementPaymentKey(mode, transfer)));
  const outstandingIncoming = incoming.filter(({ mode, transfer }) => !paymentStatus.settledKeys.has(settlementPaymentKey(mode, transfer)));
  const outgoingTotal = totalAmount(outstandingOutgoing);
  const incomingTotal = totalAmount(outstandingIncoming);
  const owesPayment = outgoing.length > 0;
  const hasIncoming = incoming.length > 0;
  const handlesBothDirections = owesPayment && hasIncoming;
  const isUp = !owesPayment && hasIncoming;
  const allMarkedSent = (owesPayment || isUp) && outstandingOutgoing.length === 0 && outstandingIncoming.length === 0;
  const resultBeforeDiscrepancy = beforeDiscrepancyNet ?? finalNet ?? 0;
  const finalResult = finalNet ?? resultBeforeDiscrepancy;
  const discrepancyAdjustment = round2(finalResult - resultBeforeDiscrepancy);
  const showDiscrepancyAdjustment = Math.abs(discrepancyAdjustment) >= 0.005;
  const hasFreshPaymentStatus = paymentStatus.phase === "known";
  const hasStalePaymentStatus = paymentStatus.phase === "stale";

  return (
    <section aria-labelledby="your-settlement-heading" className="space-y-4">
      <Card padding="sm" className="border-gray-300 bg-gray-50/60">
        <div aria-live="polite" aria-atomic="true">
          {!hasFreshPaymentStatus ? (
            <PaymentStatusNotice status={paymentStatus} headingId="your-settlement-heading" />
          ) : allMarkedSent ? (
            <div className="flex items-start gap-2.5">
              <CheckCircle2 aria-hidden className="h-5 w-5 shrink-0 text-gray-950" />
              <div>
                <h2 id="your-settlement-heading" className="text-lg font-semibold tracking-tight text-gray-950">
                  {owesPayment ? "All your payments are marked sent." : "All payments to you are marked sent."}
                </h2>
                <p className="mt-0.5 text-sm leading-5 text-gray-600">
                  {owesPayment ? "Nothing left to mark. You can reopen a payment below." : "Check your payment app or cash to confirm receipt."}
                </p>
              </div>
            </div>
          ) : handlesBothDirections && outgoingTotal > 0 && incomingTotal > 0 ? (
            <>
              <h2 id="your-settlement-heading" className="text-lg font-semibold tracking-tight text-gray-950">
                Send {formatCurrency(outgoingTotal)} · collect {formatCurrency(incomingTotal)}.
              </h2>
              <p className="mt-0.5 text-sm leading-5 text-gray-600">
                Collect the incoming payments and send the outgoing payments below. Your net result is shown separately.
              </p>
            </>
          ) : owesPayment && outgoingTotal > 0 ? (
            <>
              <h2 id="your-settlement-heading" className="text-lg font-semibold tracking-tight text-gray-950">
                You owe {formatCurrency(outgoingTotal)}.
              </h2>
              <p className="mt-0.5 text-sm leading-5 text-gray-600">
                Send each payment below, then mark it sent so the table can keep track.
              </p>
            </>
          ) : isUp || incomingTotal > 0 ? (
            <div className="flex items-start gap-2.5">
              <Trophy aria-hidden className="h-5 w-5 shrink-0 text-gray-950" />
              <div>
                <h2 id="your-settlement-heading" className="text-lg font-semibold tracking-tight text-gray-950">
                  {formatCurrency(incomingTotal)} coming to you.
                </h2>
                <p className="mt-0.5 text-sm leading-5 text-gray-600">See exactly who is paying you below.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <CheckCircle2 aria-hidden className="h-5 w-5 shrink-0 text-gray-950" />
              <div>
                <h2 id="your-settlement-heading" className="text-lg font-semibold tracking-tight text-gray-950">You&apos;re even.</h2>
                <p className="mt-0.5 text-sm leading-5 text-gray-600">No payment needed.</p>
              </div>
            </div>
          )}
        </div>
        {typeof finalNet === "number" ? <p className="mt-2 text-sm text-gray-600">Your net result: <span className="font-semibold tabular-nums text-gray-950">{formatSignedNet(finalNet)}</span></p> : null}
        {showDiscrepancyAdjustment ? <p className="mt-2 border-t border-gray-200 pt-2 text-sm text-gray-500"><span className="font-semibold tabular-nums text-gray-950">{formatSignedNet(discrepancyAdjustment)}</span>{" discrepancy adjustment · was "}<span className="tabular-nums text-gray-700">{formatSignedNet(resultBeforeDiscrepancy)}</span></p> : null}
        {hasFreshPaymentStatus && owesPayment ? <div className="mt-4"><PaymentGroups payments={outgoing} gameId={gameId} currentPlayerId={currentPlayerId} direction="outgoing" paymentStatus={paymentStatus} /></div> : null}
        {hasFreshPaymentStatus && hasIncoming ? <div className="mt-4"><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">{allMarkedSent ? "Payment record" : "Payments coming to you"}</p><PaymentGroups payments={incoming} gameId={gameId} currentPlayerId={currentPlayerId} direction="incoming" paymentStatus={paymentStatus} /></div> : null}
        {hasStalePaymentStatus && (owesPayment || hasIncoming) ? (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Last recorded payment status</p>
            {owesPayment ? <PaymentGroups payments={outgoing} gameId={gameId} currentPlayerId={currentPlayerId} direction="outgoing" paymentStatus={paymentStatus} /> : null}
            {hasIncoming ? <div className={owesPayment ? "mt-4" : ""}><PaymentGroups payments={incoming} gameId={gameId} currentPlayerId={currentPlayerId} direction="incoming" paymentStatus={paymentStatus} /></div> : null}
          </div>
        ) : null}
      </Card>
    </section>
  );
}
