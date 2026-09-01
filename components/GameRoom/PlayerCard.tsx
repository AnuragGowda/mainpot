"use client";

import { useState } from "react";
import type { BuyIn, Game, Player } from "@/lib/types";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { formatCurrency } from "@/lib/format";
import ConfirmButton from "./ConfirmButton";

export interface PlayerCardProps {
  player: Player;
  buyIns: BuyIn[];
  invested: number;
  isCurrentUser: boolean;
  isHost: boolean;
  game: Game;
  onVerify: (buyInId: string) => void;
  onEdit: (buyInId: string, amount: number) => void;
  onRemoveBuyIn: (buyInId: string) => void;
  onRemovePlayer: (playerId: string) => void;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={[
        "h-4 w-4 transition-transform duration-150",
        expanded ? "rotate-180" : "",
      ].join(" ")}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function VerifiedIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function PlayerCard({
  player,
  buyIns,
  invested,
  isCurrentUser,
  isHost,
  game,
  onVerify,
  onEdit,
  onRemoveBuyIn,
  onRemovePlayer,
}: PlayerCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  function startEdit(buyIn: BuyIn) {
    setEditingId(buyIn.id);
    setEditValue(String(buyIn.amount));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
  }

  function saveEdit(buyInId: string) {
    const parsed = Number(editValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    onEdit(buyInId, parsed);
    cancelEdit();
  }

  const buyInCount = buyIns.length;

  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-gray-900">{player.name}</h3>
            {player.is_host ? <Badge variant="gray">Host</Badge> : null}
            {player.left_at ? <Badge variant="amber">left early</Badge> : null}
            {isCurrentUser ? <Badge variant="green">You</Badge> : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold text-gray-900">{formatCurrency(invested)}</p>
          <p className="text-sm text-gray-500">
            {buyInCount} buy-in{buyInCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-label={
          expanded
            ? `Hide buy-in details for ${player.name}`
            : `Show buy-in details for ${player.name}`
        }
        className="mt-3 -ml-2"
      >
        <ChevronIcon expanded={expanded} />
        {expanded ? "Hide" : "Details"}
      </Button>

      {expanded ? (
        <div className="mt-2 border-t border-gray-100">
          {buyIns.length === 0 ? (
            <p className="py-3 text-sm text-gray-500">No buy-ins recorded yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {buyIns.map((buyIn) => {
                const editing = editingId === buyIn.id;
                return (
                  <li key={buyIn.id} className="py-3">
                    {editing ? (
                      <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-1">
                          <Input
                            type="number"
                            min={0.01}
                            step={0.01}
                            inputMode="decimal"
                            prefix="$"
                            value={editValue}
                            onChange={(event) => setEditValue(event.target.value)}
                            aria-label={`Edit amount for ${player.name}'s buy-in`}
                            autoFocus
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={() => saveEdit(buyIn.id)}
                          aria-label={`Save new amount for ${player.name}'s buy-in`}
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelEdit}
                          aria-label="Cancel editing buy-in amount"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Badge variant={buyIn.type === "rebuy" ? "amber" : "gray"}>
                            {buyIn.type === "rebuy" ? "Rebuy" : "Buy-in"}
                          </Badge>
                          <span className="font-medium text-gray-900">
                            {formatCurrency(buyIn.amount)}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {buyIn.verified ? (
                            <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600">
                              <VerifiedIcon />
                              Verified
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">Unverified</span>
                          )}
                          {isHost ? (
                            <span className="ml-1 inline-flex items-center gap-1">
                              {!buyIn.verified ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onVerify(buyIn.id)}
                                  aria-label={`Verify ${player.name}'s buy-in of ${formatCurrency(buyIn.amount)}`}
                                >
                                  Verify
                                </Button>
                              ) : null}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEdit(buyIn)}
                                aria-label={`Edit ${player.name}'s buy-in of ${formatCurrency(buyIn.amount)}`}
                              >
                                Edit
                              </Button>
                              <ConfirmButton
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:bg-red-50"
                                confirmationTitle="Remove this buy-in?"
                                confirmationDescription={<>This removes {formatCurrency(buyIn.amount)} from {player.name}&apos;s ledger.</>}
                                confirmLabel="Remove buy-in"
                                onConfirm={() => onRemoveBuyIn(buyIn.id)}
                                aria-label={`Remove ${player.name}'s buy-in of ${formatCurrency(buyIn.amount)}`}
                              >
                                Remove
                              </ConfirmButton>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {isHost && !isCurrentUser ? (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <ConfirmButton
            size="sm"
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            confirmationTitle={`Remove ${player.name}?`}
            confirmationDescription="Their buy-ins and cash-out will be removed from this game."
            confirmLabel="Remove player"
            onConfirm={() => onRemovePlayer(player.id)}
            aria-label={`Remove ${player.name} from the game`}
          >
            Remove player
          </ConfirmButton>
        </div>
      ) : null}
    </Card>
  );
}
