import type { BuyIn } from "./types";

export interface Transfer {
  from: string;
  to: string;
  amount: number;
  fromPlayerId: string | null;
  toPlayerId: string | null;
}

export interface PlayerNet {
  playerId: string;
  name: string;
  net: number;
}

export type DiscrepancyAllocationMethod = "proportional" | "selected";

export interface DiscrepancyAllocation {
  method: DiscrepancyAllocationMethod;
  /** Player ids sharing the adjustment. Empty means every eligible player. */
  playerIds: string[];
}

/**
 * Applies who-paid-for-whom adjustments without changing chip accounting.
 * The beneficiary still owns the buy-in and its chips; only the final debt is
 * shifted from the beneficiary to the player who fronted the cash.
 */
export function applyFundingAdjustments(
  players: PlayerNet[],
  buyIns: BuyIn[]
): PlayerNet[] {
  const adjustments = new Map<string, number>();

  for (const buyIn of buyIns) {
    const lenderId = buyIn.fronted_by_player_id;
    if (!lenderId || lenderId === buyIn.player_id) continue;
    adjustments.set(
      buyIn.player_id,
      (adjustments.get(buyIn.player_id) ?? 0) - buyIn.amount
    );
    adjustments.set(
      lenderId,
      (adjustments.get(lenderId) ?? 0) + buyIn.amount
    );
  }

  return players.map((player) => ({
    ...player,
    net: round2(player.net + (adjustments.get(player.playerId) ?? 0)),
  }));
}

/**
 * Brings an otherwise unbalanced set of nets back to zero after the table has
 * explicitly agreed how to treat a cash discrepancy. A positive discrepancy
 * (less cash out than bought in) reduces losses; a negative discrepancy
 * reduces winnings. This keeps the adjustment on the side that otherwise
 * over-claims the available cash.
 */
export function applyDiscrepancyAllocation(
  players: PlayerNet[],
  discrepancy: number,
  allocation: DiscrepancyAllocation
): PlayerNet[] {
  const amount = round2(Math.abs(discrepancy));
  if (amount < EPSILON) return players;

  const eligible = players.filter((player) =>
    discrepancy > 0 ? player.net < -EPSILON : player.net > EPSILON
  );
  const selected = allocation.method === "selected"
    ? eligible.filter((player) => allocation.playerIds.includes(player.playerId))
    : eligible;
  const capacity = selected.reduce((sum, player) => sum + Math.abs(player.net), 0);

  if (selected.length === 0 || capacity + EPSILON < amount) return players;

  const adjustments = new Map<string, number>();
  let remaining = amount;
  selected.forEach((player, index) => {
    const share = index === selected.length - 1
      ? remaining
      : round2(amount * Math.abs(player.net) / capacity);
    adjustments.set(player.playerId, discrepancy > 0 ? share : -share);
    remaining = round2(remaining - share);
  });

  return players.map((player) => ({
    ...player,
    net: round2(player.net + (adjustments.get(player.playerId) ?? 0)),
  }));
}

const EPSILON = 0.005;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Greedy minimum-transfers settlement:
 * 1. Separate creditors (net > EPSILON) and debtors (net < -EPSILON); ignore
 *    near-zero nets so balanced players never appear in a transfer.
 * 2. Sort both by absolute net descending.
 * 3. Pair the largest creditor with the largest debtor, transfer the smaller
 *    of the two amounts, and drop anyone who reaches ~0 (<= 0.005).
 * 4. Return transfers sorted by amount descending.
 */
export function calculateMinTransfers(players: PlayerNet[]): Transfer[] {
  const creditors = players
    .filter((p) => p.net > EPSILON)
    .map((p) => ({ ...p }))
    .sort((a, b) => b.net - a.net);

  const debtors = players
    .filter((p) => p.net < -EPSILON)
    .map((p) => ({ ...p }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  const transfers: Transfer[] = [];

  while (creditors.length > 0 && debtors.length > 0) {
    const creditor = creditors[0];
    const debtor = debtors[0];
    const transfer = Math.min(creditor.net, Math.abs(debtor.net));

    transfers.push({
      from: debtor.name,
      to: creditor.name,
      amount: round2(transfer),
      fromPlayerId: debtor.playerId,
      toPlayerId: creditor.playerId,
    });

    creditor.net -= transfer;
    debtor.net += transfer;

    if (Math.abs(creditor.net) <= EPSILON) {
      creditors.shift();
    }
    if (Math.abs(debtor.net) <= EPSILON) {
      debtors.shift();
    }
  }

  return transfers.sort((a, b) => b.amount - a.amount);
}

/**
 * Bank-style settlement: every player (except the bank) either pays the
 * bank (net < 0) or gets paid by the bank (net > 0). Players with
 * |net| <= 0.005 are ignored.
 */
export function calculateBankSettlement(
  players: PlayerNet[],
  bankPlayerId: string
): Transfer[] {
  const transfers: Transfer[] = [];

  for (const player of players) {
    if (player.playerId === bankPlayerId) {
      continue;
    }

    const net = player.net;
    if (Math.abs(net) <= EPSILON) {
      continue;
    }

    if (net < 0) {
      transfers.push({
        from: player.name,
        to: "Bank",
        amount: round2(Math.abs(net)),
        fromPlayerId: player.playerId,
        toPlayerId: bankPlayerId,
      });
    } else {
      transfers.push({
        from: "Bank",
        to: player.name,
        amount: round2(net),
        fromPlayerId: bankPlayerId,
        toPlayerId: player.playerId,
      });
    }
  }

  return transfers;
}
