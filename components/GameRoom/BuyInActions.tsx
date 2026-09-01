"use client";

import { useRef, useState } from "react";
import type { Game, Player } from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { formatCurrency } from "@/lib/format";
import { randomUUID } from "@/lib/session";
import ConfirmButton from "./ConfirmButton";

export interface BuyInActionsProps {
  game: Game;
  players: Player[];
  currentPlayerId: string;
  hasBuyIn: boolean;
  onBuyIn: (operationKey: string) => Promise<boolean>;
  onRebuy: (amount: number, frontedByPlayerId: string | null, operationKey: string) => Promise<boolean>;
  ledgerAction: "buy-in" | "rebuy" | null;
  onLeave: () => void;
  leaving: boolean;
  left: boolean;
}

export default function BuyInActions({
  game,
  players,
  currentPlayerId,
  hasBuyIn,
  onBuyIn,
  onRebuy,
  ledgerAction,
  onLeave,
  leaving,
  left,
}: BuyInActionsProps) {
  const [rebuyOpen, setRebuyOpen] = useState(false);
  const [rebuyAmount, setRebuyAmount] = useState(String(game.buy_in_amount));
  const [frontedByPlayerId, setFrontedByPlayerId] = useState("");
  const buyInOperationKey = useRef<string | null>(null);
  const rebuyOperationKey = useRef<string | null>(null);

  function openRebuy() {
    setRebuyAmount(String(game.buy_in_amount));
    setFrontedByPlayerId("");
    rebuyOperationKey.current = null;
    setRebuyOpen(true);
  }

  function closeRebuy() {
    rebuyOperationKey.current = null;
    setRebuyOpen(false);
  }

  async function submitRebuy() {
    const parsed = Number(rebuyAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    const operationKey = rebuyOperationKey.current ?? randomUUID();
    rebuyOperationKey.current = operationKey;
    const added = await onRebuy(parsed, frontedByPlayerId || null, operationKey);
    if (added) {
      closeRebuy();
    }
  }

  async function submitBuyIn() {
    const operationKey = buyInOperationKey.current ?? randomUUID();
    buyInOperationKey.current = operationKey;
    const added = await onBuyIn(operationKey);
    if (added) {
      buyInOperationKey.current = null;
    }
  }

  const submitting = ledgerAction !== null;

  if (left) {
    return null;
  }

  return (
    <div className="w-full">
      {rebuyOpen ? (
        <div className="mb-3 grid gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-lg shadow-gray-950/5 sm:grid-cols-[1fr_1.15fr_auto_auto] sm:items-end">
          <div className="min-w-0 flex-1">
            <Input
              type="number"
              min={0.01}
              step={0.01}
              inputMode="decimal"
              prefix="$"
              value={rebuyAmount}
              onChange={(event) => setRebuyAmount(event.target.value)}
              aria-label="Rebuy amount"
              autoFocus
              disabled={submitting}
            />
          </div>
          <label className="min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">Paid by</span>
            <select
              value={frontedByPlayerId}
              onChange={(event) => setFrontedByPlayerId(event.target.value)}
              disabled={submitting}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-950 focus:outline-none focus:ring-2 focus:ring-gray-950/10"
            >
              <option value="">Me</option>
              {players
                .filter((player) => player.id !== currentPlayerId && !player.left_at)
                .map((player) => (
                  <option key={player.id} value={player.id}>{player.name} (fronted)</option>
                ))}
            </select>
          </label>
          <Button size="md" onClick={submitRebuy} aria-label="Add rebuy" loading={ledgerAction === "rebuy"} disabled={submitting}>
            {ledgerAction === "rebuy" ? "Adding…" : "Add rebuy"}
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={closeRebuy}
            aria-label="Cancel rebuy"
            disabled={submitting}
            className="hidden sm:inline-flex"
          >
            Cancel
          </Button>
        </div>
      ) : null}

      <div className="flex gap-2">
        {hasBuyIn ? (
          <Button
            className="flex-1"
            onClick={() => (rebuyOpen ? closeRebuy() : openRebuy())}
            aria-expanded={rebuyOpen}
            disabled={submitting}
          >
            {rebuyOpen ? "Close rebuy" : "Add a rebuy"}
          </Button>
        ) : (
          <Button className="flex-1" onClick={() => void submitBuyIn()} loading={ledgerAction === "buy-in"} disabled={submitting}>
            {ledgerAction === "buy-in" ? "Adding buy-in…" : `Buy in · ${formatCurrency(game.buy_in_amount)}`}
          </Button>
        )}
        <ConfirmButton
          variant="ghost"
          className="hidden flex-none text-red-600 hover:bg-red-50 sm:inline-flex"
          onConfirm={onLeave}
          loading={leaving}
          aria-label="Leave the game"
        >
          Leave
        </ConfirmButton>
      </div>
    </div>
  );
}
