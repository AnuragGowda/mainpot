"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Game, Player } from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { formatCurrency } from "@/lib/format";
import { randomUUID } from "@/lib/session";
import ConfirmButton from "./ConfirmButton";

export interface BuyInActionsProps {
  game: Game;
  players: Player[];
  currentPlayerId: string;
  hasBuyIn: boolean;
  onBuyIn: (frontedByPlayerId: string | null, operationKey: string) => Promise<boolean>;
  onRebuy: (amount: number, frontedByPlayerId: string | null, operationKey: string) => Promise<boolean>;
  ledgerAction: "buy-in" | "rebuy" | null;
  onLeave: () => void;
  leaving: boolean;
  left: boolean;
  leaveAction?: ReactNode;
}

interface AdvanceFieldsProps {
  players: Player[];
  currentPlayerId: string;
  entryLabel: string;
  enabled: boolean;
  frontedByPlayerId: string;
  onEnabledChange: (enabled: boolean) => void;
  onFrontedByPlayerIdChange: (playerId: string) => void;
  disabled: boolean;
}

function AdvanceFields({
  players,
  currentPlayerId,
  entryLabel,
  enabled,
  frontedByPlayerId,
  onEnabledChange,
  onFrontedByPlayerIdChange,
  disabled,
}: AdvanceFieldsProps) {
  const eligiblePlayers = players.filter(
    (player) => player.id !== currentPlayerId && !player.left_at,
  );

  if (!eligiblePlayers.length) return null;

  return (
    <details className="rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2.5">
      <summary className="cursor-pointer list-none text-sm font-medium text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950">
        Payment details <span className="font-normal text-gray-400">(optional)</span>
      </summary>
      <div className="mt-3 space-y-3 border-t border-gray-200 pt-3">
        <label className="flex items-start gap-2.5 text-sm leading-5 text-gray-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              onEnabledChange(event.target.checked);
              if (!event.target.checked) onFrontedByPlayerIdChange("");
            }}
            disabled={disabled}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-950 focus:ring-gray-950"
          />
          <span>Someone else paid and I still owe them</span>
        </label>
        {enabled ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Paid by
              <Select
                value={frontedByPlayerId || undefined}
                onValueChange={onFrontedByPlayerIdChange}
                disabled={disabled}
              >
                <SelectTrigger className="mt-1.5" aria-label={`Who advanced your ${entryLabel}?`}>
                  <SelectValue placeholder="Choose a player" />
                </SelectTrigger>
                <SelectContent>
                  {eligiblePlayers.map((player) => (
                    <SelectItem key={player.id} value={player.id}>
                      {player.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <p className="text-xs leading-5 text-gray-500">
              Use this only when that player is still owed. If you already paid them—or bought chips from their personal stack—leave this off.
            </p>
          </div>
        ) : null}
      </div>
    </details>
  );
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
  leaveAction,
}: BuyInActionsProps) {
  const [rebuyOpen, setRebuyOpen] = useState(false);
  const [rebuyAmount, setRebuyAmount] = useState(String(game.buy_in_amount));
  const [buyInAdvance, setBuyInAdvance] = useState(false);
  const [buyInFrontedByPlayerId, setBuyInFrontedByPlayerId] = useState("");
  const [rebuyAdvance, setRebuyAdvance] = useState(false);
  const [rebuyFrontedByPlayerId, setRebuyFrontedByPlayerId] = useState("");
  const buyInOperationKey = useRef<string | null>(null);
  const rebuyOperationKey = useRef<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const submitting = ledgerAction !== null;

  useEffect(() => {
    if (!rebuyOpen) return;
    const actions = actionsRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        event.preventDefault();
        closeRebuy();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() =>
        actions
          ?.querySelector<HTMLButtonElement>('[aria-controls="rebuy-panel"]')
          ?.focus(),
      );
    };
  }, [rebuyOpen, submitting]);

  function openRebuy() {
    setRebuyAmount(String(game.buy_in_amount));
    setRebuyAdvance(false);
    setRebuyFrontedByPlayerId("");
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
    if (rebuyAdvance && !rebuyFrontedByPlayerId) return;
    const added = await onRebuy(
      parsed,
      rebuyAdvance ? rebuyFrontedByPlayerId : null,
      operationKey,
    );
    if (added) {
      closeRebuy();
    }
  }

  async function submitBuyIn() {
    if (buyInAdvance && !buyInFrontedByPlayerId) return;
    const operationKey = buyInOperationKey.current ?? randomUUID();
    buyInOperationKey.current = operationKey;
    const added = await onBuyIn(
      buyInAdvance ? buyInFrontedByPlayerId : null,
      operationKey,
    );
    if (added) {
      buyInOperationKey.current = null;
      setBuyInAdvance(false);
      setBuyInFrontedByPlayerId("");
    }
  }

  if (left) {
    return null;
  }

  return (
    <div className="w-full">
      {rebuyOpen ? (
        <div
          id="rebuy-panel"
          role="dialog"
          aria-label="Add a rebuy"
          className="fixed inset-x-0 bottom-0 z-40 grid max-h-[min(80dvh,32rem)] gap-2 overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl shadow-gray-950/20 sm:static sm:mb-3 sm:max-h-none sm:overflow-visible sm:rounded-xl sm:p-3 sm:shadow-lg sm:shadow-gray-950/5 sm:[grid-template-columns:1fr_1.15fr_auto_auto] sm:items-end"
        >
          <div className="sm:col-span-4">
            <p className="text-base font-semibold text-gray-950">Add a rebuy</p>
            <p className="mt-1 text-sm leading-5 text-gray-500">
              Record new chips received from the table&apos;s bank.
            </p>
          </div>
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">Rebuy amount</span>
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
          </label>
          <div className="min-w-0">
            <AdvanceFields
              players={players}
              currentPlayerId={currentPlayerId}
              entryLabel="rebuy"
              enabled={rebuyAdvance}
              frontedByPlayerId={rebuyFrontedByPlayerId}
              onEnabledChange={setRebuyAdvance}
              onFrontedByPlayerIdChange={setRebuyFrontedByPlayerId}
              disabled={submitting}
            />
          </div>
          <Button size="md" onClick={submitRebuy} aria-label="Add rebuy" loading={ledgerAction === "rebuy"} disabled={submitting || (rebuyAdvance && !rebuyFrontedByPlayerId)}>
            {ledgerAction === "rebuy" ? "Adding…" : "Add rebuy"}
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={closeRebuy}
            aria-label="Cancel rebuy"
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
        </div>
      ) : null}

      <div ref={actionsRef} className="flex gap-2">
        {hasBuyIn ? (
          <Button
            className="flex-1"
            onClick={() => (rebuyOpen ? closeRebuy() : openRebuy())}
            aria-expanded={rebuyOpen}
            aria-controls="rebuy-panel"
            disabled={submitting}
          >
            {rebuyOpen ? "Close rebuy" : "Add a rebuy"}
          </Button>
        ) : (
          <ConfirmButton
            variant="primary"
            confirmVariant="primary"
            className="flex-1"
            confirmationTitle={`Add your ${formatCurrency(game.buy_in_amount)} buy-in?`}
            confirmationDescription={(
              <div className="space-y-3">
                <p>This adds the opening buy-in to the shared ledger for the host to review.</p>
                <AdvanceFields
                  players={players}
                  currentPlayerId={currentPlayerId}
                  entryLabel="opening buy-in"
                  enabled={buyInAdvance}
                  frontedByPlayerId={buyInFrontedByPlayerId}
                  onEnabledChange={setBuyInAdvance}
                  onFrontedByPlayerIdChange={setBuyInFrontedByPlayerId}
                  disabled={submitting}
                />
              </div>
            )}
            confirmLabel="Add buy-in"
            confirmDisabled={buyInAdvance && !buyInFrontedByPlayerId}
            onConfirm={submitBuyIn}
            loading={ledgerAction === "buy-in"}
            disabled={submitting}
          >
            {ledgerAction === "buy-in" ? "Adding buy-in…" : `Buy in · ${formatCurrency(game.buy_in_amount)}`}
          </ConfirmButton>
        )}
        {leaveAction ?? <ConfirmButton
          variant="ghost"
          className="flex-none text-red-600 hover:bg-red-50"
          confirmationTitle="Leave the table?"
          confirmationDescription="Your buy-ins stay in the ledger. You won’t be able to add more, and the host can enter your final cash-out when the game ends."
          confirmLabel="Leave table"
          onConfirm={onLeave}
          loading={leaving}
          aria-label="Leave the game"
        >
          Leave
        </ConfirmButton>}
      </div>
    </div>
  );
}
