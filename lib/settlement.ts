export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface PlayerNet {
  playerId: string;
  name: string;
  net: number;
}

const EPSILON = 0.005;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Greedy minimum-transfers settlement:
 * 1. Separate creditors (net > 0) and debtors (net < 0); ignore net === 0.
 * 2. Sort both by absolute net descending.
 * 3. Pair the largest creditor with the largest debtor, transfer the smaller
 *    of the two amounts, and drop anyone who reaches ~0 (<= 0.005).
 * 4. Return transfers sorted by amount descending.
 */
export function calculateMinTransfers(players: PlayerNet[]): Transfer[] {
  const creditors = players
    .filter((p) => p.net > 0)
    .map((p) => ({ ...p }))
    .sort((a, b) => b.net - a.net);

  const debtors = players
    .filter((p) => p.net < 0)
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
      });
    } else {
      transfers.push({
        from: "Bank",
        to: player.name,
        amount: round2(net),
      });
    }
  }

  return transfers;
}