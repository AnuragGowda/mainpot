"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSettlementPaymentStatuses, subscribeToPaymentChanges } from "./payments";
import { withTimeout } from "./request-timeout";
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
const PAYMENT_STATUS_RECONCILIATION_MS = 5_000;

/** Do not start a network read while this client cannot reliably reach the server. */
export function canReadPaymentStatuses(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine
    && typeof document !== "undefined" && document.visibilityState === "visible";
}

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
  const readInFlight = useRef<{ gameId: string; read: number } | null>(null);
  const refreshQueuedFor = useRef<string | null>(null);
  const latestRefresh = useRef<((force?: boolean) => void) | null>(null);
  const hasKnownStatus = useRef(false);

  const refresh = useCallback((force = false, quiet = false) => {
    if (!enabled || !canReadPaymentStatuses()) return;
    if (!force && readInFlight.current?.gameId === gameId) {
      // Collapse bursts into one trailing reconciliation after the current read.
      if (!quiet) refreshQueuedFor.current = gameId;
      return;
    }
    refreshQueuedFor.current = null;
    const read = ++latestRead.current;
    readInFlight.current = { gameId, read };
    if (!quiet) {
      if (hasKnownStatus.current) {
        setPhase("stale");
      } else {
        setPhase("loading");
        setSettledKeys(EMPTY_KEYS);
      }
    }
    void withTimeout(getSettlementPaymentStatuses(gameId), "Payment status read timed out.", 12_000)
      .then((statuses) => {
        if (read !== latestRead.current) return;
        hasKnownStatus.current = true;
        setSettledKeys(new Set(statuses.filter((item) => item.settled).map((item) => item.key)));
        setPhase("known");
      })
      .catch(() => {
        if (read !== latestRead.current) return;
        setPhase(hasKnownStatus.current ? "stale" : "unavailable");
      })
      .finally(() => {
        if (readInFlight.current?.read !== read) return;
        readInFlight.current = null;
        if (refreshQueuedFor.current !== gameId) return;
        refreshQueuedFor.current = null;
        latestRefresh.current?.();
      });
  }, [enabled, gameId]);

  useEffect(() => {
    latestRead.current += 1;
    readInFlight.current = null;
    hasKnownStatus.current = false;
    latestRefresh.current = refresh;
    refreshQueuedFor.current = null;
    setSettledKeys(EMPTY_KEYS);
    setPhase("loading");
    if (!enabled) return;

    refresh();
    const unsubscribe = subscribeToPaymentChanges(gameId, refresh);
    const onOnline = () => refresh();
    const onOffline = () => {
      // Ignore any response from a read that was in flight when connectivity was lost.
      latestRead.current += 1;
      readInFlight.current = null;
      refreshQueuedFor.current = null;
      setPhase(hasKnownStatus.current ? "stale" : "unavailable");
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    // Realtime is a latency optimization. A foreground, online settlement
    // must eventually converge when a WebSocket frame is missed.
    const reconciliation = window.setInterval(() => refresh(false, true), PAYMENT_STATUS_RECONCILIATION_MS);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const supabase = getBrowserSupabase();
    const channel = supabase
      ?.channel(`settlement-payment-status-${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settlement_payments", filter: `game_id=eq.${gameId}` },
        () => refresh(),
      )
      .subscribe((channelStatus) => {
        // Reconcile after subscription so a write during channel setup is not missed.
        if (channelStatus === "SUBSCRIBED") refresh();
      });

    return () => {
      latestRead.current += 1;
      readInFlight.current = null;
      if (latestRefresh.current === refresh) latestRefresh.current = null;
      refreshQueuedFor.current = null;
      unsubscribe();
      window.clearInterval(reconciliation);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [enabled, gameId, refresh]);

  return {
    phase,
    settledKeys,
    canMutate: phase === "known",
    retry: () => refresh(true),
  };
}
