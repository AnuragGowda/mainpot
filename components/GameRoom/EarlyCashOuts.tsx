"use client";

import { useId, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { formatCurrency, formatSignedNet } from "@/lib/format";
import { calculateEarlyCashOutNet, getEarlyCashOutTransfer } from "@/lib/settlement";
import type { GameSnapshot } from "@/lib/types";
import type { SettlementPaymentStatusState } from "@/lib/use-settlement-payment-status";
import TransferList from "@/components/Settlement/TransferList";
import ConfirmButton from "./ConfirmButton";

interface EarlyCashOutsProps {
  snapshot: GameSnapshot;
  currentPlayerId: string;
  isHost: boolean;
  onApprove?: (earlyCashOutId: string) => Promise<void>;
  onCancel?: (earlyCashOutId: string) => Promise<void>;
  paymentStatus?: SettlementPaymentStatusState;
}

/** Shared request queue and payment record for players leaving before game end. */
export default function EarlyCashOuts({
  snapshot,
  currentPlayerId,
  isHost,
  onApprove,
  onCancel,
  paymentStatus,
}: EarlyCashOutsProps) {
  const headingId = useId();
  const [busyId, setBusyId] = useState<string | null>(null);
  const visible = snapshot.earlyCashOuts.filter(
    (item) => item.status === "locked"
      || (item.status === "requested" && onApprove && onCancel && (isHost || item.player_id === currentPlayerId))
  );
  if (!visible.length) return null;

  async function run(id: string, action: (earlyCashOutId: string) => Promise<void>) {
    setBusyId(id);
    try {
      await action(id);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3">
        <h2 id={headingId} className="text-base font-semibold text-gray-950">Early cash-outs</h2>
        <p className="text-sm text-gray-500">Locked results settle with the host separately from the final settlement.</p>
      </div>
      <div className="space-y-3">
        {visible.map((earlyCashOut) => {
          const player = snapshot.players.find((item) => item.id === earlyCashOut.player_id);
          const bank = snapshot.players.find((item) => item.id === earlyCashOut.bank_player_id);
          if (!player) return null;
          const pendingEntries = snapshot.buyIns.filter(
            (buyIn) => !buyIn.verified
              && (buyIn.player_id === player.id || buyIn.fronted_by_player_id === player.id)
          );
          const previewNet = calculateEarlyCashOutNet(
            snapshot.buyIns,
            player.id,
            earlyCashOut.cash_out_amount,
          );
          const transfer = getEarlyCashOutTransfer(earlyCashOut, snapshot.players);
          const ownRequest = player.id === currentPlayerId;

          return (
            <Card key={earlyCashOut.id} padding="md" className={earlyCashOut.status === "requested" ? "border-amber-200 bg-amber-50/40" : "border-gray-300"}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-gray-950">{player.name}</h3>
                    {ownRequest ? <Badge variant="green">You</Badge> : null}
                    <Badge variant={earlyCashOut.status === "locked" ? "gray" : "amber"}>
                      {earlyCashOut.status === "locked" ? "cashed out" : "host review"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    Final chips <strong className="font-semibold text-gray-950">{formatCurrency(earlyCashOut.cash_out_amount)}</strong>
                  </p>
                </div>
                <p className="text-right">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {earlyCashOut.status === "locked" ? "Locked result" : "Preview"}
                  </span>
                  <span className="font-semibold tabular-nums text-gray-950">
                    {formatSignedNet(earlyCashOut.net_amount ?? previewNet)}
                  </span>
                </p>
              </div>

              {earlyCashOut.status === "requested" ? (
                <div className="mt-4 border-t border-amber-200 pt-4">
                  <p className="text-sm leading-6 text-gray-700">
                    {isHost
                      ? `Confirm ${player.name}’s chips to lock their result and create one payment with you.`
                      : `Waiting for ${snapshot.game.host_name} to confirm your chips. You stay active until it is locked.`}
                  </p>
                  {pendingEntries.length ? (
                    <p role="alert" className="mt-2 text-sm font-medium text-amber-900">
                      Resolve {pendingEntries.length} pending {pendingEntries.length === 1 ? "buy-in" : "buy-ins"} involving {player.name} first.
                    </p>
                  ) : null}
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    {isHost && onApprove ? (
                      <Button
                        loading={busyId === earlyCashOut.id}
                        disabled={pendingEntries.length > 0}
                        onClick={() => void run(earlyCashOut.id, onApprove)}
                        className="sm:flex-1"
                      >
                        Confirm &amp; lock
                      </Button>
                    ) : null}
                    {(isHost || ownRequest) && onCancel ? (
                      <ConfirmButton
                        variant="secondary"
                        confirmVariant="danger"
                        loading={busyId === earlyCashOut.id}
                        confirmationTitle={isHost ? `Decline ${player.name}’s request?` : "Cancel your early cash-out?"}
                        confirmationDescription="The player stays active and no cash-out or payment will be recorded."
                        confirmLabel={isHost ? "Decline request" : "Cancel request"}
                        onConfirm={() => void run(earlyCashOut.id, onCancel)}
                        className="sm:flex-1"
                      >
                        {isHost ? "Decline" : "Cancel request"}
                      </ConfirmButton>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-4 border-t border-gray-200 pt-4">
                  <p className="mb-3 text-sm leading-6 text-gray-600">
                    Confirmed by {bank?.name ?? "the host"}. This result is excluded from the remaining payment calculation.
                  </p>
                  {transfer ? (
                    <TransferList
                      transfers={[transfer]}
                      gameId={snapshot.game.id}
                      mode="early_exit"
                      currentPlayerId={currentPlayerId}
                      isHost={isHost}
                      actionsEnabled
                      earlyCashOut={earlyCashOut}
                      paymentStatus={paymentStatus}
                    />
                  ) : (
                    <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">No payment needed — this player is even.</p>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
