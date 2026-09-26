"use client";

import Button from "@/components/ui/Button";
import type { SettlementPaymentStatusState } from "@/lib/use-settlement-payment-status";

export default function PaymentStatusNotice({
  status,
  headingId,
}: {
  status: SettlementPaymentStatusState;
  headingId?: string;
}) {
  if (status.phase === "known") return null;

  const title = status.phase === "loading"
    ? "Checking payment status"
    : status.phase === "stale"
      ? "Payment status needs refresh"
      : "Payment status unavailable";
  const copy = status.phase === "loading"
    ? "Payment records are loading. Wait before sending or changing a payment."
    : status.phase === "stale"
      ? "Showing the last recorded payment status. Do not send or change a payment until it refreshes."
      : "Mainpot could not confirm whether a payment was sent. Do not send or change a payment until status loads.";

  return (
    <div role={status.phase === "loading" ? "status" : "alert"} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      {headingId ? <h2 id={headingId} className="font-semibold">{title}</h2> : <p className="font-semibold">{title}</p>}
      <p className="mt-1 leading-5">{copy}</p>
      {status.phase !== "loading" ? (
        <Button variant="secondary" size="sm" className="mt-3" onClick={status.retry}>
          Retry payment status
        </Button>
      ) : null}
    </div>
  );
}
