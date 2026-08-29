"use client";

import { useState } from "react";
import type { Game } from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { formatCurrency } from "@/lib/format";
import ConfirmButton from "./ConfirmButton";

export interface BuyInActionsProps {
  game: Game;
  onBuyIn: () => void;
  onRebuy: (amount: number) => void;
  onLeave: () => void;
  leaving: boolean;
  left: boolean;
}

export default function BuyInActions({
  game,
  onBuyIn,
  onRebuy,
  onLeave,
  leaving,
  left,
}: BuyInActionsProps) {
  const [rebuyOpen, setRebuyOpen] = useState(false);
  const [rebuyAmount, setRebuyAmount] = useState(String(game.buy_in_amount));

  function openRebuy() {
    setRebuyAmount(String(game.buy_in_amount));
    setRebuyOpen(true);
  }

  function submitRebuy() {
    const parsed = Number(rebuyAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    onRebuy(parsed);
    setRebuyOpen(false);
  }

  if (left) {
    return null;
  }

  return (
    <div className="w-full">
      {rebuyOpen ? (
        <div className="mb-3 flex items-end gap-2 rounded-md border border-gray-200 bg-white p-2 shadow-sm">
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
            />
          </div>
          <Button size="md" onClick={submitRebuy} aria-label="Add rebuy">
            Add rebuy
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={() => setRebuyOpen(false)}
            aria-label="Cancel rebuy"
          >
            Cancel
          </Button>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={onBuyIn}>
          Buy in · {formatCurrency(game.buy_in_amount)}
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => setRebuyOpen((open) => !open)}
          aria-expanded={rebuyOpen}
        >
          Rebuy
        </Button>
        <ConfirmButton
          variant="ghost"
          className="flex-none text-red-600 hover:bg-red-50"
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