"use client";

import { validateCurrencyAmount } from "@/lib/currency-input";

import { useEffect, useRef, useState } from "react";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { getPlayerCashOut, playerInvested } from "@/lib/game";
import { formatCurrency, round2 } from "@/lib/format";
import { randomUUID } from "@/lib/session";
import type { GameSnapshot, Player } from "@/lib/types";

export interface CashOutEntryProps {
  snapshot: GameSnapshot;
  currentPlayerId: string | null;
  isHost: boolean;
  onSaveCashOut: (playerId: string, amount: number, operationKey: string) => Promise<boolean>;
}

interface CashOutRowProps {
  player: Player;
  snapshot: GameSnapshot;
  editable: boolean;
  isCurrentUser: boolean;
  earlyCashOutLocked: boolean;
  onSaveCashOut: (playerId: string, amount: number, operationKey: string) => Promise<boolean>;
}

interface ReadOnlyCashOutRowProps {
  player: Player;
  snapshot: GameSnapshot;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const SAVE_DEBOUNCE_MS = 400;

/**
 * One player's cash-out input. Local state is seeded from the snapshot and
 * re-synced from a new saved value, but never while a local draft is focused,
 * saving, or has failed. This keeps a rapid blur from letting a deferred React
 * effect replace the draft with the stale snapshot it is about to save.
 */
function CashOutRow({
  player,
  snapshot,
  editable,
  isCurrentUser,
  earlyCashOutLocked,
  onSaveCashOut,
}: CashOutRowProps) {
  const currentCashOut = getPlayerCashOut(snapshot, player.id);
  const currentAmount = currentCashOut ? round2(currentCashOut.amount) : null;
  const propValue = currentCashOut ? String(currentCashOut.amount) : "";
  const [value, setValue] = useState(propValue);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [remoteUpdateNotice, setRemoteUpdateNotice] = useState(false);
  const focusedRef = useRef(false);
  const valueAtFocusRef = useRef("");
  const valueRef = useRef(propValue);
  const debounceRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRequestRef = useRef(0);
  const pendingSaveCountRef = useRef(0);
  const failedDraftRef = useRef(false);
  const lastObservedPropValueRef = useRef(propValue);
  const mountedRef = useRef(true);
  const lastRequestedAmountRef = useRef<number | null>(currentAmount);
  const saveOperationRef = useRef<{ raw: string; key: string } | null>(null);

  function setLocalValue(nextValue: string) {
    valueRef.current = nextValue;
    setValue(nextValue);
  }

  useEffect(() => {
    const receivedNewSnapshotValue = lastObservedPropValueRef.current !== propValue;
    lastObservedPropValueRef.current = propValue;
    if (!receivedNewSnapshotValue) return;

    // React runs effects after paint. A fast fill + blur can flip focusedRef
    // before the effect scheduled by the local value change runs, so only a
    // genuine new snapshot may reconcile the field.
    if (pendingSaveCountRef.current > 0 || failedDraftRef.current) {
      return;
    }

    // A focused field that has not been edited locally is safe to reconcile.
    // Keeping it in sync avoids showing a row amount that disagrees with the
    // realtime totals while the user is simply reading the field.
    if (focusedRef.current) {
      if (valueRef.current === valueAtFocusRef.current && valueRef.current !== propValue) {
        setLocalValue(propValue);
        valueAtFocusRef.current = propValue;
        setSaveStatus("idle");
        setRemoteUpdateNotice(true);
      }
      return;
    }

    setLocalValue(propValue);
    lastRequestedAmountRef.current = currentAmount;
  }, [currentAmount, propValue]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  /** Saves `raw` when it parses to a finite, non-negative amount. */
  function commit(raw: string) {
    if (raw.trim() === "") {
      return;
    }
    const parsed = Number(raw);
    if (validateCurrencyAmount(raw)) {
      return;
    }
    if (
      lastRequestedAmountRef.current !== null &&
      Math.abs(parsed - lastRequestedAmountRef.current) <= 0.004
    ) {
      return;
    }

    lastRequestedAmountRef.current = parsed;
    const operation = saveOperationRef.current?.raw === raw
      ? saveOperationRef.current
      : { raw, key: randomUUID() };
    saveOperationRef.current = operation;
    const requestId = ++saveRequestRef.current;
    pendingSaveCountRef.current += 1;
    setSaveStatus("saving");

    // Preserve the order in which a player edits an amount. Without this queue,
    // a slower earlier request can finish after a newer edit and overwrite it.
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        let saved = false;
        try {
          saved = await onSaveCashOut(player.id, parsed, operation.key);
        } catch {
          saved = false;
        } finally {
          pendingSaveCountRef.current -= 1;
        }
        if (!mountedRef.current || requestId !== saveRequestRef.current) return;

        if (!saved) {
          lastRequestedAmountRef.current = null;
          failedDraftRef.current = true;
        } else {
          failedDraftRef.current = false;
        }
        setSaveStatus(saved ? "saved" : "error");
      });
  }

  function handleChange(raw: string) {
    setLocalValue(raw);
    failedDraftRef.current = false;
    setRemoteUpdateNotice(false);
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    setSaveStatus("idle");
    debounceRef.current = window.setTimeout(() => void commit(raw), SAVE_DEBOUNCE_MS);
  }

  function handleFocus() {
    focusedRef.current = true;
    valueAtFocusRef.current = valueRef.current;
    setRemoteUpdateNotice(false);
  }

  function handleBlur() {
    focusedRef.current = false;
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const draft = valueRef.current;
    if (draft !== valueAtFocusRef.current || failedDraftRef.current) {
      void commit(draft);
    }
  }

  const invested = playerInvested(snapshot, player.id);
  const hint = earlyCashOutLocked
    ? "Locked when this player left"
    : !editable && player.left_at
      ? "Host will enter"
      : null;

  return (
      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_11rem] sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-sm font-semibold text-gray-900">{player.name}</h3>
            {player.is_host ? <Badge variant="gray">Host</Badge> : null}
            {earlyCashOutLocked
              ? <Badge variant="gray">cashed out early</Badge>
              : player.left_at
                ? <Badge variant="amber">left early</Badge>
                : null}
            {isCurrentUser ? <Badge variant="green">You</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Bought in {formatCurrency(invested)}
          </p>
        </div>

        <div className="min-w-0">
          <Input
            // A text field avoids native number-input steppers while preserving
            // a decimal keypad on mobile for a player's own entry.
            type={isCurrentUser && !player.is_host ? "text" : "number"}
            min={0}
            step={0.01}
            inputMode="decimal"
            autoComplete="off"
            pattern="[0-9]*[.]?[0-9]*"
            prefix="$"
            error={value ? validateCurrencyAmount(value) ?? undefined : undefined}
            value={value}
            disabled={!editable}
            placeholder="0.00"
            aria-label={`Cash-out amount for ${player.name}`}
            onChange={(event) => handleChange(event.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
          <p
            className={`mt-1 min-h-4 text-xs ${saveStatus === "error" ? "text-red-600" : "text-gray-500"}`}
            aria-live="polite"
          >
            {hint ?? (value && validateCurrencyAmount(value) ? "Not saved" : remoteUpdateNotice ? "Updated by another player" : saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Could not save" : !value ? "Not entered" : "Saved")}
          </p>
        </div>
      </div>
  );
}

/** A compact table row for amounts the current player may view but not edit. */
function ReadOnlyCashOutRow({ player, snapshot }: ReadOnlyCashOutRowProps) {
  const cashOut = getPlayerCashOut(snapshot, player.id);
  const invested = playerInvested(snapshot, player.id);
  const earlyCashOutLocked = snapshot.earlyCashOuts.some(
    (item) => item.player_id === player.id && item.status === "locked"
  );

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-gray-900">{player.name}</h3>
          {player.is_host ? <Badge variant="gray">Host</Badge> : null}
          {earlyCashOutLocked
            ? <Badge variant="gray">cashed out early</Badge>
            : player.left_at
              ? <Badge variant="amber">left early</Badge>
              : null}
        </div>
        <p className="mt-0.5 text-sm text-gray-500">Bought in {formatCurrency(invested)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-600">Final stack</p>
        <p className="mt-0.5 font-semibold tabular-nums text-gray-900">
          {cashOut ? formatCurrency(cashOut.amount) : "Not entered"}
        </p>
      </div>
    </li>
  );
}

/**
 * Card list of cash-out entry rows — one per player (including players who
 * left early). Hosts can edit everyone's row; players can edit their own.
 */
export default function CashOutEntry({
  snapshot,
  currentPlayerId,
  isHost,
  onSaveCashOut,
}: CashOutEntryProps) {
  const isPlayerView = !isHost && currentPlayerId !== null;
  const currentPlayer = snapshot.players.find((player) => player.id === currentPlayerId);
  const otherPlayers = snapshot.players.filter((player) => player.id !== currentPlayerId);
  const currentPlayerEarlyCashOutLocked = Boolean(
    currentPlayer
    && snapshot.earlyCashOuts.some(
      (item) => item.player_id === currentPlayer.id && item.status === "locked"
    )
  );

  if (isPlayerView && currentPlayer) {
    return (
      <section aria-labelledby="cash-out-heading" className="space-y-6">
        <div>
          <h2 id="cash-out-heading" className="sr-only">Cash-outs</h2>
          <h3 className="text-sm font-medium uppercase tracking-widest text-gray-500">
            Your cash-out
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Enter your final chip value, not your profit. Saves automatically.
          </p>
        </div>
        <Card padding="none" className="overflow-hidden">
          <CashOutRow
            player={currentPlayer}
            snapshot={snapshot}
            editable={snapshot.game.status === "settling" && !currentPlayerEarlyCashOutLocked}
            isCurrentUser
            earlyCashOutLocked={currentPlayerEarlyCashOutLocked}
            onSaveCashOut={onSaveCashOut}
          />
        </Card>

        <div>
          <h3 className="text-sm font-medium uppercase tracking-widest text-gray-500">Table cash-outs</h3>
        </div>
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-gray-100" aria-label="Table cash-outs">
            {otherPlayers.map((player) => (
              <ReadOnlyCashOutRow key={player.id} player={player} snapshot={snapshot} />
            ))}
          </ul>
        </Card>
      </section>
    );
  }

  // Keep the amount the person viewing this screen can act on at the top.
  // Copy first so the snapshot's canonical player order remains untouched.
  const orderedPlayers = [...snapshot.players].sort((first, second) => {
    const firstIsCurrent = first.id === currentPlayerId;
    const secondIsCurrent = second.id === currentPlayerId;
    return Number(secondIsCurrent) - Number(firstIsCurrent);
  });

  return (
    <section aria-labelledby="cash-out-heading">
      <h2
        id="cash-out-heading"
        className="mb-1 text-base font-semibold text-gray-950"
      >
        Cash-outs
      </h2>
      <p className="mb-4 max-w-2xl text-sm leading-6 text-gray-500">
        Final chip values, not profit. Changes save automatically.
      </p>
      <Card padding="none" className="divide-y divide-gray-100 overflow-hidden">
        {orderedPlayers.map((player) => {
          const earlyCashOutLocked = snapshot.earlyCashOuts.some(
            (item) => item.player_id === player.id && item.status === "locked"
          );
          const editable = !earlyCashOutLocked
            && snapshot.game.status === "settling"
            && (isHost || player.id === currentPlayerId);
          return (
            <CashOutRow
              key={player.id}
              player={player}
              snapshot={snapshot}
              editable={editable}
              isCurrentUser={player.id === currentPlayerId}
              earlyCashOutLocked={earlyCashOutLocked}
              onSaveCashOut={onSaveCashOut}
            />
          );
        })}
      </Card>
    </section>
  );
}
