import { getBrowserSupabase } from "./supabase-browser";
import { getSessionId } from "./session";
import type { Transfer } from "./settlement";
import type { EarlyCashOut } from "./types";

export type SettlementMode = "min" | "bank" | "early_exit";

export interface SettlementPaymentStatus {
  key: string;
  settled: boolean;
}

const paymentStatusEvent = "mainpot:payment-status-changed";

/** Reconcile every mounted view after a successful write, including local mode. */
export function subscribeToPaymentChanges(gameId: string, refresh: () => void): () => void {
  const onPaymentChange = (event: Event) => {
    if ((event as CustomEvent<string>).detail === gameId) refresh();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === localKey(gameId) || event.key === null) refresh();
  };
  window.addEventListener(paymentStatusEvent, onPaymentChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(paymentStatusEvent, onPaymentChange);
    window.removeEventListener("storage", onStorage);
  };
}

function notifyPaymentChange(gameId: string): void {
  window.dispatchEvent(new CustomEvent(paymentStatusEvent, { detail: gameId }));
}

function paymentKey(mode: SettlementMode, transfer: Transfer): string {
  return [mode, transfer.fromPlayerId, transfer.toPlayerId, transfer.amount.toFixed(2)].join(":");
}

function localKey(gameId: string): string {
  return `ante_settlement_payments_${gameId}`;
}

export async function getSettlementPaymentStatuses(gameId: string): Promise<SettlementPaymentStatus[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    try {
      const rows: unknown = JSON.parse(window.localStorage.getItem(localKey(gameId)) ?? "[]");
      if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object"
        || typeof row.key !== "string" || typeof row.settled !== "boolean")) {
        throw new Error("Invalid payment records.");
      }
      return rows as SettlementPaymentStatus[];
    } catch {
      throw new Error("Could not read payment status saved in this browser. Restore browser storage access and retry.");
    }
  }
  const { data, error } = await supabase
    .from("settlement_payments")
    .select("from_player_id,to_player_id,amount,mode,settled")
    .eq("game_id", gameId);
  if (error) throw new Error(`Could not load payment status: ${error.message}`);
  return (data ?? []).map((row) => ({
    key: [row.mode, row.from_player_id, row.to_player_id, Number(row.amount).toFixed(2)].join(":"),
    settled: Boolean(row.settled),
  }));
}

export async function setSettlementPaymentStatus(
  gameId: string,
  mode: SettlementMode,
  transfer: Transfer,
  settled: boolean
): Promise<void> {
  const key = paymentKey(mode, transfer);
  const supabase = getBrowserSupabase();
  if (!supabase) {
    const statuses = await getSettlementPaymentStatuses(gameId);
    const next = statuses.filter((item) => item.key !== key);
    next.push({ key, settled });
    window.localStorage.setItem(localKey(gameId), JSON.stringify(next));
    notifyPaymentChange(gameId);
    return;
  }
  if (!transfer.fromPlayerId || !transfer.toPlayerId) {
    throw new Error("This payment cannot be identified.");
  }
  const { error } = await supabase.rpc("set_settlement_payment_status_guarded", {
    input_game_id: gameId,
    input_from_player_id: transfer.fromPlayerId,
    input_to_player_id: transfer.toPlayerId,
    input_amount: transfer.amount,
    input_mode: mode,
    input_settled: settled,
    input_session_id: getSessionId(),
  });
  if (error) throw new Error(`Could not update payment status: ${error.message}`);
  notifyPaymentChange(gameId);
}

export async function setEarlyCashOutPaymentStatus(
  earlyCashOut: EarlyCashOut,
  transfer: Transfer,
  settled: boolean
): Promise<void> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    const statuses = await getSettlementPaymentStatuses(earlyCashOut.game_id);
    const key = paymentKey("early_exit", transfer);
    const next = statuses.filter((item) => item.key !== key);
    next.push({ key, settled });
    window.localStorage.setItem(localKey(earlyCashOut.game_id), JSON.stringify(next));
    notifyPaymentChange(earlyCashOut.game_id);
    return;
  }
  const { error } = await supabase.rpc("set_early_cash_out_payment_status", {
    input_early_cash_out_id: earlyCashOut.id,
    input_settled: settled,
    input_session_id: getSessionId(),
  });
  if (error) {
    if (error.code === "PGRST202" || error.message.includes("early_cash_out")) {
      throw new Error("This game database needs the early-cash-out migration before payment tracking is available.");
    }
    throw new Error(`Could not update payment status: ${error.message}`);
  }
  notifyPaymentChange(earlyCashOut.game_id);
}

export function settlementPaymentKey(mode: SettlementMode, transfer: Transfer): string {
  return paymentKey(mode, transfer);
}
