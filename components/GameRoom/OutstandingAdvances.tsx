"use client";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import type { GameSnapshot } from "@/lib/types";
import ConfirmButton from "./ConfirmButton";

interface OutstandingAdvancesProps {
  snapshot: GameSnapshot;
  isHost: boolean;
  onMarkRepaid: (buyInId: string) => void;
}

export default function OutstandingAdvances({
  snapshot,
  isHost,
  onMarkRepaid,
}: OutstandingAdvancesProps) {
  const advances = snapshot.buyIns.flatMap((buyIn) => {
    if (!buyIn.fronted_by_player_id) return [];
    const borrower = snapshot.players.find((player) => player.id === buyIn.player_id);
    const lender = snapshot.players.find(
      (player) => player.id === buyIn.fronted_by_player_id,
    );
    return borrower && lender ? [{ buyIn, borrower, lender }] : [];
  });

  if (!advances.length) return null;

  return (
    <section aria-labelledby="outstanding-advances-heading">
      <div className="mb-3">
        <h2 id="outstanding-advances-heading" className="text-base font-semibold text-gray-950">
          Outstanding advances
        </h2>
        <p className="text-sm text-gray-500">
          These repayments will be included at settlement without changing the pot.
        </p>
      </div>
      <Card padding="none" className="divide-y divide-amber-100 overflow-hidden border-amber-200 shadow-none">
        {advances.map(({ buyIn, borrower, lender }) => (
          <div key={buyIn.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-gray-950">
                  {borrower.name} still owes {lender.name}
                </p>
                <Badge variant="amber">Outstanding</Badge>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                {buyIn.type === "rebuy" ? "Rebuy" : "Opening buy-in"} · {formatCurrency(buyIn.amount)} advanced
              </p>
            </div>
            {isHost ? (
              <ConfirmButton
                size="sm"
                variant="secondary"
                confirmVariant="primary"
                className="w-full sm:w-auto"
                confirmationTitle="Mark this advance repaid?"
                confirmationDescription={`${borrower.name} will no longer repay ${lender.name} through the final settlement. The buy-in and pot stay unchanged.`}
                confirmLabel="Mark repaid"
                onConfirm={() => onMarkRepaid(buyIn.id)}
              >
                Mark repaid
              </ConfirmButton>
            ) : null}
          </div>
        ))}
      </Card>
    </section>
  );
}
