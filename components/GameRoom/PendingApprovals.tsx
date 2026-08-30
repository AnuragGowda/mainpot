"use client";

import { CircleCheck, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { formatCurrency } from "@/lib/format";
import type { GameSnapshot } from "@/lib/types";

interface PendingApprovalsProps {
  snapshot: GameSnapshot;
  isHost: boolean;
  onVerify: (buyInId: string) => void;
  onEdit: (buyInId: string, amount: number) => void;
  onRemove: (buyInId: string) => void;
}

export default function PendingApprovals({ snapshot, isHost, onVerify, onEdit, onRemove }: PendingApprovalsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  if (!isHost) return null;

  const pending = snapshot.buyIns.filter((buyIn) => !buyIn.verified);
  if (!pending.length) return null;

  return (
    <section aria-labelledby="approvals-heading">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 id="approvals-heading" className="text-base font-semibold text-gray-950">Needs approval</h2>
          <p className="text-sm text-gray-500">Confirm new money before it becomes final.</p>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{pending.length} pending</span>
      </div>
      <Card padding="none" className="overflow-hidden border-amber-200 shadow-none">
        <ul className="divide-y divide-amber-100">
          {pending.map((buyIn) => {
            const player = snapshot.players.find((item) => item.id === buyIn.player_id);
            const editing = editingId === buyIn.id;
            return (
              <li key={buyIn.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-950">{player?.name ?? "Player"}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{buyIn.type === "rebuy" ? "Rebuy" : "Buy-in"} · {formatCurrency(buyIn.amount)}</p>
                  </div>
                  <Button size="sm" onClick={() => onVerify(buyIn.id)} leftIcon={<CircleCheck size={16} />}>Approve</Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Edit ${player?.name ?? "player"} buy-in`}
                    onClick={() => {
                      setEditingId(editing ? null : buyIn.id);
                      setAmount(String(buyIn.amount));
                    }}
                    leftIcon={<Pencil size={15} />}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Remove ${player?.name ?? "player"} buy-in`} onClick={() => onRemove(buyIn.id)}>
                    <Trash2 aria-hidden size={15} />
                  </Button>
                </div>
                {editing ? (
                  <div className="mt-3 flex items-end gap-2">
                    <Input label="Correct amount" type="number" min={0.01} step={0.01} prefix="$" value={amount} onChange={(event) => setAmount(event.target.value)} />
                    <Button
                      className="mb-px"
                      onClick={() => {
                        const next = Number(amount);
                        if (!Number.isFinite(next) || next <= 0) return;
                        onEdit(buyIn.id, next);
                        setEditingId(null);
                      }}
                    >
                      Save
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
