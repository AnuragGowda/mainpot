"use client";

import { useEffect, useRef, useState } from "react";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { getPlayerCashOut, playerInvested } from "@/lib/game";
import { formatCurrency, round2 } from "@/lib/format";
import type { GameSnapshot, Player } from "@/lib/types";

export interface CashOutEntryProps {
  snapshot: GameSnapshot;
  currentPlayerId: string | null;
  isHost: boolean;
  onSaveCashOut: (playerId: string, amount: number) => Promise<boolean>;
}

interface CashOutRowProps {
  player: Player;
  snapshot: GameSnapshot;
  editable: boolean;
  isCurrentUser: boolean;
  onSaveCashOut: (playerId: string, amount: number) => Promise<boolean>;
}

interface ReadOnlyCashOutRowProps {
  player: Player;
  snapshot: GameSnapshot;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const SAVE_DEBOUNCE_MS = 400;

/**
 * One player's cash-out input. Local state is seeded from the snapshot and
 * re-synced from props whenever the saved value changes — but never while the
 * user is focused/typing, so realtime updates don't clobber an in-progress edit.
 */
function CashOutRow({
  player,
  snapshot,
  editable,
  isCurrentUser,
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
  const debounceRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRequestRef = useRef(0);
  const pendingSaveCountRef = useRef(0);
  const mountedRef = useRef(true);
  const lastRequestedAmountRef = useRef<number | null>(currentAmount);

  useEffect(() => {
    if (!focusedRef.current) {
      setValue(propValue);
      if (pendingSaveCountRef.current === 0) {
        lastRequestedAmountRef.current = currentAmount;
      }
      return;
    }

    // A focused field that has not been edited locally is safe to reconcile.
    // Keeping it in sync avoids showing a row amount that disagrees with the
    // realtime totals while the user is simply reading the field.
    if (value === valueAtFocusRef.current && value !== propValue) {
      setValue(propValue);
      valueAtFocusRef.current = propValue;
      setSaveStatus("idle");
      setRemoteUpdateNotice(true);
    }
  }, [currentAmount, propValue, value]);

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
    const parsed = round2(Number(raw));
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    if (
      lastRequestedAmountRef.current !== null &&
      Math.abs(parsed - lastRequestedAmountRef.current) <= 0.004
    ) {
      return;
    }

    lastRequestedAmountRef.current = parsed;
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
          saved = await onSaveCashOut(player.id, parsed);
        } catch {
          saved = false;
        } finally {
          pendingSaveCountRef.current -= 1;
        }
        if (!mountedRef.current || requestId !== saveRequestRef.current) return;

        if (!saved) lastRequestedAmountRef.current = null;
        setSaveStatus(saved ? "saved" : "error");
      });
  }

  function handleChange(raw: string) {
    setValue(raw);
    setRemoteUpdateNotice(false);
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    setSaveStatus("idle");
    debounceRef.current = window.setTimeout(() => void commit(raw), SAVE_DEBOUNCE_MS);
  }

  function handleFocus() {
    focusedRef.current = true;
    valueAtFocusRef.current = value;
    setRemoteUpdateNotice(false);
  }

  function handleBlur() {
    focusedRef.current = false;
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (value !== valueAtFocusRef.current) {
      void commit(value);
    } else {
      setValue(propValue);
    }
  }

  const invested = playerInvested(snapshot, player.id);
  const hint = !editable && player.left_at ? "Host will enter" : null;

  return (
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-gray-900">{player.name}</h3>
            {player.is_host ? <Badge variant="gray">Host</Badge> : null}
            {player.left_at ? <Badge variant="amber">left early</Badge> : null}
            {isCurrentUser ? <Badge variant="green">You</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            Bought in {formatCurrency(invested)}
          </p>
        </div>

        <div className="w-full shrink-0 sm:w-44">
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
            value={value}
            disabled={!editable}
            placeholder="0.00"
            aria-label={`Cash-out amount for ${player.name}`}
            onChange={(event) => handleChange(event.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
          <p
            className={`mt-1 text-xs ${saveStatus === "error" ? "text-red-600" : saveStatus === "saved" ? "text-emerald-700" : "text-gray-400"}`}
            aria-live="polite"
          >
            {hint ?? (remoteUpdateNotice ? "Updated by another player" : saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Could not save" : editable ? "Saves automatically" : "Read only")}
          </p>
        </div>
      </div>
  );
}

/** A compact table row for amounts the current player may view but not edit. */
function ReadOnlyCashOutRow({ player, snapshot }: ReadOnlyCashOutRowProps) {
  const cashOut = getPlayerCashOut(snapshot, player.id);
  const invested = playerInvested(snapshot, player.id);

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-gray-900">{player.name}</h3>
          {player.is_host ? <Badge variant="gray">Host</Badge> : null}
          {player.left_at ? <Badge variant="amber">left early</Badge> : null}
        </div>
        <p className="mt-0.5 text-sm text-gray-500">Bought in {formatCurrency(invested)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Final stack</p>
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

  if (isPlayerView && currentPlayer) {
    return (
      <section aria-labelledby="cash-out-heading" className="space-y-6">
        <div>
          <h2 id="cash-out-heading" className="sr-only">Cash-outs</h2>
          <h3 className="text-sm font-medium uppercase tracking-widest text-gray-500">
            Your cash-out
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Enter your final chip value, not your profit. Your amount saves automatically.
          </p>
        </div>
        <Card padding="none" className="overflow-hidden">
          <CashOutRow
            player={currentPlayer}
            snapshot={snapshot}
            editable={snapshot.game.status === "settling"}
            isCurrentUser
            onSaveCashOut={onSaveCashOut}
          />
        </Card>

        <div>
          <h3 className="text-sm font-medium uppercase tracking-widest text-gray-500">Table cash-outs</h3>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            Other players&apos; final stacks update here as they&apos;re entered. These values are read-only.
          </p>
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
        className="mb-2 text-sm font-medium uppercase tracking-widest text-gray-500"
      >
        Cash-outs
      </h2>
      <p className="mb-4 max-w-2xl text-sm leading-6 text-gray-500">
        Enter each player&apos;s final chip value, not their profit. Players can
        enter their own amount; the host can correct any row.
      </p>
      <Card padding="none" className="divide-y divide-gray-100 overflow-hidden">
        {orderedPlayers.map((player) => {
          const editable = snapshot.game.status === "settling" && (isHost || player.id === currentPlayerId);
          return (
            <CashOutRow
              key={player.id}
              player={player}
              snapshot={snapshot}
              editable={editable}
              isCurrentUser={player.id === currentPlayerId}
              onSaveCashOut={onSaveCashOut}
            />
          );
        })}
      </Card>
    </section>
  );
}
