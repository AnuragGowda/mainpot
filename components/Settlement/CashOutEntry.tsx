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
  const propValue = currentCashOut ? String(currentCashOut.amount) : "";
  const [value, setValue] = useState(propValue);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [remoteUpdateNotice, setRemoteUpdateNotice] = useState(false);
  const focusedRef = useRef(false);
  const valueAtFocusRef = useRef("");
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!focusedRef.current) {
      setValue(propValue);
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
  }, [propValue, value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  /** Saves `raw` when it parses to a finite, non-negative amount. */
  async function commit(raw: string) {
    if (raw.trim() === "") {
      return;
    }
    const parsed = round2(Number(raw));
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    const current = currentCashOut ? round2(currentCashOut.amount) : Number.NaN;
    if (Number.isNaN(current) || Math.abs(parsed - current) > 0.004) {
      setSaveStatus("saving");
      const saved = await onSaveCashOut(player.id, parsed);
      setSaveStatus(saved ? "saved" : "error");
    }
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
            type="number"
            min={0}
            step={0.01}
            inputMode="decimal"
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
        {snapshot.players.map((player) => {
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
