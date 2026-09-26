"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSettlementPaymentStatuses, subscribeToPaymentChanges } from "./payments";
import { getBrowserSupabase } from "./supabase-browser";

export type PaymentStatusReadPhase = "loading" | "known" | "unavailable" | "stale";

export interface SettlementPaymentStatusState {
  phase: PaymentStatusReadPhase;
  settledKeys: ReadonlySet<string>;
  /** A status read has completed successfully and payment mutations are safe to offer. */
  canMutate: boolean;
  retry: () => void;
}

const EMPTY_KEYS: ReadonlySet<string> = new Set<string>();

/**
 * Holds the one authoritative payment-status read for a finalized settlement.
 * A failed refresh never replaces confirmed records with an empty status set.
 */
export function useSettlementPaymentStatus(
  gameId: string,
  enabled = true,
): SettlementPaymentStatusState {
  const [phase, setPhase] = useState<PaymentStatusReadPhase>("loading");
  const [settledKeys, setSettledKeys] = useState<ReadonlySet<string>>(EMPTY_KEYS);
  const latestRead = useRef(0);
  const hasKnownStatus = useRef(false);

  const refresh = useCallback(() => {
    if (!enabled) return;
    const read = ++latestRead.current;
    if (!hasKnownStatus.current) {
      setPhase("loading");
      setSettledKeys(EMPTY_KEYS);
    }
    void getSettlementPaymentStatuses(gameId)
      .then((statuses) => {
        if (read !== latestRead.current) return;
        hasKnownStatus.current = true;
        setSettledKeys(new Set(statuses.filter((item) => item.settled).map((item) => item.key)));
        setPhase("known");
      })
      .catch(() => {
        if (read !== latestRead.current) return;
        setPhase(hasKnownStatus.current ? "stale" : "unavailable");
      });
  }, [enabled, gameId]);

  useEffect(() => {
    latestRead.current += 1;
    hasKnownStatus.current = false;
    setSettledKeys(EMPTY_KEYS);
    setPhase("loading");
    if (!enabled) return;

    refresh();
    const unsubscribe = subscribeToPaymentChanges(gameId, refresh);
    const supabase = getBrowserSupabase();
    const channel = supabase
      ?.channel(`settlement-payment-status-${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settlement_payments", filter: `game_id=eq.${gameId}` },
        refresh,
      )
      .subscribe((channelStatus) => {
        // Reconcile after subscription so a write during channel setup is not missed.
        if (channelStatus === "SUBSCRIBED") refresh();
      });

    return () => {
      latestRead.current += 1;
      unsubscribe();
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [enabled, gameId, refresh]);

  return {
    phase,
    settledKeys,
    canMutate: phase === "known",
    retry: refresh,
  };
}
