import type { BuyIn, CashOut, GameSnapshot } from "./types";

/** All buy-ins (initial + rebuys) recorded for a player, in created order. */
export function getPlayerBuyIns(
  snapshot: GameSnapshot,
  playerId: string
): BuyIn[] {
  return snapshot.buyIns.filter((buyIn) => buyIn.player_id === playerId);
}

/** Total amount a player has put in via buy-ins and rebuys. */
export function playerInvested(snapshot: GameSnapshot, playerId: string): number {
  return getPlayerBuyIns(snapshot, playerId).reduce(
    (sum, buyIn) => sum + buyIn.amount,
    0
  );
}

/** Sum of ALL buy-ins in the game — the total pot. */
export function totalPot(snapshot: GameSnapshot): number {
  return snapshot.buyIns.reduce((sum, buyIn) => sum + buyIn.amount, 0);
}

/** The player's cash-out record, if any (one per player). */
export function getPlayerCashOut(
  snapshot: GameSnapshot,
  playerId: string
): CashOut | undefined {
  return snapshot.cashOuts.find((cashOut) => cashOut.player_id === playerId);
}