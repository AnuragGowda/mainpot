import { getPlayerCashOut, playerInvested, totalPot } from "./game";
import { round2 } from "./format";
import { settlementPaymentKey, type SettlementPaymentStatus } from "./payments";
import { applyDiscrepancyAllocation, applyFundingAdjustments, calculateBankSettlement, calculateMinTransfers, getEarlyCashOutTransfer, rollForwardEarlyCashOuts } from "./settlement";
import type { GameSnapshot } from "./types";

export interface PaymentProgress { total: number; markedSent: number }

/** Count the immutable plan, not just status rows (unsent transfers may have no row). */
export function getPaymentProgress(snapshot: GameSnapshot, statuses: SettlementPaymentStatus[]): PaymentProgress {
  const raw = applyFundingAdjustments(snapshot.players.map((player) => ({
    playerId: player.id, name: player.name,
    net: round2((getPlayerCashOut(snapshot, player.id)?.amount ?? 0) - playerInvested(snapshot, player.id)),
  })), snapshot.buyIns.filter((entry) => entry.verified));
  const remaining = rollForwardEarlyCashOuts(raw, snapshot.earlyCashOuts);
  const difference = round2(totalPot(snapshot) - snapshot.cashOuts.reduce((sum, entry) => sum + entry.amount, 0));
  const allocation = snapshot.game.discrepancy_allocation;
  const nets = allocation && Math.abs(difference) >= 0.005 ? applyDiscrepancyAllocation(remaining, difference, {
    method: allocation.method, playerIds: allocation.player_ids,
    playerAllocations: allocation.player_allocations?.map((item) => ({ playerId: item.player_id, amount: item.amount })),
  }) : remaining;
  const mode = snapshot.game.settlement_mode === "bank" && snapshot.game.settlement_bank_player_id ? "bank" : "min";
  const final = mode === "bank" ? calculateBankSettlement(nets, snapshot.game.settlement_bank_player_id!) : calculateMinTransfers(nets);
  const keys = new Set(final.map((transfer) => settlementPaymentKey(mode, transfer)));
  for (const exit of snapshot.earlyCashOuts) {
    const transfer = getEarlyCashOutTransfer(exit, snapshot.players);
    if (transfer) keys.add(settlementPaymentKey("early_exit", transfer));
  }
  const sent = new Set(statuses.filter((item) => item.settled).map((item) => item.key));
  return { total: keys.size, markedSent: [...keys].filter((key) => sent.has(key)).length };
}
