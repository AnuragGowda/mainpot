import { formatCurrency, formatSignedNet } from "./format";
import { discrepancyAllocationLabel, getPlayerNetChanges } from "./settlement";
import type { DiscrepancyAllocation, PlayerNet, Transfer } from "./settlement";
import type { Game } from "./types";

export interface SummaryInput {
  game: Game;
  transfers: Transfer[];
  nets: PlayerNet[];
  mode: "min" | "bank";
  bankName?: string;
  totalBoughtIn: number;
  discrepancyAllocation?: DiscrepancyAllocation | null;
  discrepancyAmount?: number;
  beforeDiscrepancyNets?: PlayerNet[];
}

/**
 * Builds the plain-text settlement summary shown in the settlement screen
 * and shared via the Web Share API / clipboard.
 */
export function buildSummaryText({
  game,
  transfers,
  nets,
  mode,
  bankName,
  totalBoughtIn,
  discrepancyAllocation,
  discrepancyAmount = 0,
  beforeDiscrepancyNets,
}: SummaryInput): string {
  const lines: string[] = [
    `Mainpot — ${game.name}`,
    `Room code: ${game.code}`,
    `Buy-in: ${formatCurrency(game.buy_in_amount)}`,
    `Total pot: ${formatCurrency(totalBoughtIn)}`,
    "",
  ];

  const settlementLabel =
    mode === "min" ? "fewest payments" : `bank: ${bankName ?? ""}`;
  lines.push(`Settlements (${settlementLabel}):`);
  if (transfers.length === 0) {
    lines.push("No transfers needed.");
  } else {
    for (const transfer of transfers) {
      lines.push(
        `${transfer.from} pays ${transfer.to} ${formatCurrency(transfer.amount)}`
      );
    }
  }

  lines.push("");
  if (discrepancyAllocation && discrepancyAmount > 0.004) {
    lines.push(`Discrepancy: ${formatCurrency(discrepancyAmount)}`);
    lines.push(`Allocation: ${discrepancyAllocationLabel(discrepancyAllocation.method)}`);
    if (beforeDiscrepancyNets) {
      const affectedPlayers = getPlayerNetChanges(beforeDiscrepancyNets, nets)
        .filter((player) => Math.abs(player.adjustment) >= 0.005);
      if (affectedPlayers.length > 0) {
        lines.push("Result changes:");
        for (const player of affectedPlayers) {
          lines.push(
            `${player.name}: ${formatSignedNet(player.before)} ${formatSignedNet(player.adjustment)} discrepancy → ${formatSignedNet(player.final)}`
          );
        }
      }
    }
    lines.push("");
  }
  lines.push("Final net:");
  for (const net of nets) {
    lines.push(`${net.name}: ${formatSignedNet(net.net)}`);
  }

  return lines.join("\n");
}
