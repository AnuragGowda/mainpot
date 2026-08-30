"use client";

import { useState } from "react";
import type { Game, Player } from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { formatCurrency } from "@/lib/format";
import ConfirmButton from "./ConfirmButton";

export interface BuyInActionsProps {
  game: Game;
  players: Player[];
  currentPlayerId: string;
  onBuyIn: () => void;
  onRebuy: (amount: number, frontedByPlayerId?: string | null) => void;
  onLeave: () => void;
  leaving: boolean;
  left: boolean;
}

export default function BuyInActions({
  game,
  players,
  currentPlayerId,
  onBuyIn,
  onRebuy,
  onLeave,
  leaving,
  left,
}: BuyInActionsProps) {
  const [rebuyOpen, setRebuyOpen] = useState(false);
  const [rebuyAmount, setRebuyAmount] = useState(String(game.buy_in_amount));
  const [frontedByPlayerId, setFrontedByPlayerId] = useState("");

  function openRebuy() {
    setRebuyAmount(String(game.buy_in_amount));
    setFrontedByPlayerId("");
    setRebuyOpen(true);
  }

  function submitRebuy() {
    const parsed = Number(rebuyAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    onRebuy(parsed, frontedByPlayerId || null);
    setRebuyOpen(false);
  }

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
            />
          </div>
          <label className="min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">Paid by</span>
            <select
              value={frontedByPlayerId}
              onChange={(event) => setFrontedByPlayerId(event.target.value)}
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
          <Button size="md" onClick={submitRebuy} aria-label="Add rebuy">
            Add rebuy
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={() => setRebuyOpen(false)}
            aria-label="Cancel rebuy"
            className="hidden sm:inline-flex"
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
