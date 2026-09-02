"use client";

import { CircleCheck, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { formatCurrency } from "@/lib/format";
import type { GameSnapshot } from "@/lib/types";
import ConfirmButton from "./ConfirmButton";

interface PendingApprovalsProps {
  snapshot: GameSnapshot;
  isHost: boolean;
  onVerify: (buyInId: string) => Promise<void>;
  onVerifyAll: (buyInIds: string[]) => Promise<void>;
  onEdit: (buyInId: string, amount: number) => void;
  onRemove: (buyInId: string) => void;
}

export default function PendingApprovals({
  snapshot,
  isHost,
  onVerify,
  onVerifyAll,
  onEdit,
  onRemove,
}: PendingApprovalsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [approvingAll, setApprovingAll] = useState(false);
  if (!isHost) return null;

  const pending = snapshot.buyIns.filter((buyIn) => !buyIn.verified);
  if (!pending.length) return null;

  return (
    <section aria-labelledby="approvals-heading">
      <Card padding="none" className="overflow-hidden border-amber-200 shadow-none">
        <div className="border-b border-amber-100 bg-amber-50/50 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="approvals-heading"
                  className="text-base font-semibold text-gray-950"
                >
                  Needs approval
                </h2>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  {pending.length} pending
                </span>
              </div>
              <p className="mt-0.5 text-sm text-gray-600">
                Confirm new money before it becomes final.
              </p>
            </div>
            {pending.length > 1 ? (
              <Button
                size="sm"
                className="w-full sm:w-auto sm:shrink-0"
                loading={approvingAll}
                onClick={async () => {
                  setApprovingAll(true);
                  try {
                    await onVerifyAll(pending.map((buyIn) => buyIn.id));
                  } finally {
                    setApprovingAll(false);
                  }
                }}
              >
                Approve all
              </Button>
            ) : null}
          </div>
        </div>
        <ul className="divide-y divide-amber-100">
          {pending.map((buyIn) => {
            const player = snapshot.players.find((item) => item.id === buyIn.player_id);
            const lender = snapshot.players.find(
              (item) => item.id === buyIn.fronted_by_player_id,
            );
            const editing = editingId === buyIn.id;
            const editFormId = `pending-edit-${buyIn.id}`;
            return (
              <li key={buyIn.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-4 sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-950">
                        {player?.name ?? "Player"}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {buyIn.type === "rebuy" ? "Rebuy" : "Buy-in"}
                      </p>
                      {lender ? (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          Outstanding advance owed to {lender.name}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums text-gray-950">
                      {formatCurrency(buyIn.amount)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 sm:shrink-0">
                    <Button
                      size="sm"
                      className="flex-1 sm:flex-none"
                      onClick={() => void onVerify(buyIn.id)}
                      leftIcon={<CircleCheck aria-hidden size={16} />}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-11 px-0 sm:w-9 sm:px-0"
                      aria-label={`Edit ${player?.name ?? "player"} ${buyIn.type === "rebuy" ? "rebuy" : "buy-in"} of ${formatCurrency(buyIn.amount)}`}
                      title="Edit entry"
                      aria-expanded={editing}
                      aria-controls={editFormId}
                      onClick={() => {
                        setEditingId(editing ? null : buyIn.id);
                        setAmount(String(buyIn.amount));
                      }}
                    >
                      <Pencil aria-hidden size={15} />
                    </Button>
                    <ConfirmButton
                      size="sm"
                      variant="ghost"
                      className="w-11 px-0 sm:w-9 sm:px-0"
                      confirmationTitle="Remove this pending entry?"
                      confirmationDescription={`${player?.name ?? "This player"}’s ${buyIn.type === "rebuy" ? "rebuy" : "buy-in"} of ${formatCurrency(buyIn.amount)} will be removed before it is approved.`}
                      confirmLabel="Remove entry"
                      aria-label={`Remove ${player?.name ?? "player"} ${buyIn.type === "rebuy" ? "rebuy" : "buy-in"} of ${formatCurrency(buyIn.amount)}`}
                      title="Remove entry"
                      onConfirm={() => onRemove(buyIn.id)}
                    >
                      <Trash2 aria-hidden size={15} />
                    </ConfirmButton>
                  </div>
                </div>
                {editing ? (
                  <form
                    id={editFormId}
                    className="mt-4 flex flex-col gap-2 rounded-lg bg-gray-50 p-3 sm:flex-row sm:items-end"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const next = Number(amount);
                      if (!Number.isFinite(next) || next <= 0) return;
                      onEdit(buyIn.id, next);
                      setEditingId(null);
                    }}
                  >
                    <Input
                      label="Correct amount"
                      type="number"
                      min={0.01}
                      step={0.01}
                      inputMode="decimal"
                      prefix="$"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                    <Button type="submit" className="mb-px">
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null);
                        setAmount("");
                      }}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
