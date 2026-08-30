import { getBrowserSupabase } from "./supabase-browser";
import type { Transfer } from "./settlement";

export type SettlementMode = "min" | "bank";

export interface SettlementPaymentStatus {
  key: string;
  settled: boolean;
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
      return JSON.parse(window.localStorage.getItem(localKey(gameId)) ?? "[]") as SettlementPaymentStatus[];
    } catch {
      return [];
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
    return;
  }
  if (!transfer.fromPlayerId || !transfer.toPlayerId) {
    throw new Error("This payment cannot be identified.");
  }
  const { error } = await supabase.from("settlement_payments").upsert({
    game_id: gameId,
    from_player_id: transfer.fromPlayerId,
    to_player_id: transfer.toPlayerId,
    amount: transfer.amount,
    mode,
    settled,
    settled_at: settled ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "game_id,from_player_id,to_player_id,amount,mode" });
  if (error) throw new Error(`Could not update payment status: ${error.message}`);
}

export function settlementPaymentKey(mode: SettlementMode, transfer: Transfer): string {
  return paymentKey(mode, transfer);
}

