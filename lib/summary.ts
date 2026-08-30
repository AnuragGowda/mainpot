import { formatCurrency, formatSignedNet } from "./format";
import type { PlayerNet, Transfer } from "./settlement";
import type { Game } from "./types";

export interface SummaryInput {
  game: Game;
  transfers: Transfer[];
  nets: PlayerNet[];
  mode: "min" | "bank";
  bankName?: string;
  totalBoughtIn: number;
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
}: SummaryInput): string {
  const lines: string[] = [
    `Mainpot — ${game.name}`,
    `Room code: ${game.code}`,
    `Buy-in: ${formatCurrency(game.buy_in_amount)}`,
    `Total pot: ${formatCurrency(totalBoughtIn)}`,
    "",
  ];

  const settlementLabel =
    mode === "min" ? "min transfers" : `bank: ${bankName ?? ""}`;
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
  lines.push("Net:");
  for (const net of nets) {
    lines.push(`${net.name}: ${formatSignedNet(net.net)}`);
  }

  return lines.join("\n");
}
