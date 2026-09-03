import { formatCurrency, formatSignedNet } from "@/lib/format";
import { discrepancyAllocationLabel, getPlayerNetChanges } from "@/lib/settlement";
import type { DiscrepancyAllocation, PlayerNet } from "@/lib/settlement";

export interface DiscrepancyImpactProps {
  amount: number;
  allocation: DiscrepancyAllocation;
  beforeNets: PlayerNet[];
  finalNets: PlayerNet[];
}

/** Compact host-facing audit of the result changes caused by a discrepancy. */
export default function DiscrepancyImpact({
  amount,
  allocation,
  beforeNets,
  finalNets,
}: DiscrepancyImpactProps) {
  const affectedPlayers = getPlayerNetChanges(beforeNets, finalNets)
    .filter((player) => Math.abs(player.adjustment) >= 0.005);

  if (affectedPlayers.length === 0) return null;

  return (
    <div role="group" aria-label="Discrepancy impact" className="mt-3 border-t border-gray-200 pt-3 text-sm">
      <p className="font-medium text-gray-700">
        Discrepancy: <span className="font-semibold text-gray-950">{formatCurrency(amount)}</span>
        <span className="text-gray-400"> · </span>
        {discrepancyAllocationLabel(allocation.method)}
      </p>
      <ul className="mt-1.5 space-y-1">
        {affectedPlayers.map((player) => {
          const before = formatSignedNet(player.before);
          const adjustment = formatSignedNet(player.adjustment);
          const final = formatSignedNet(player.final);
          return (
            <li
              key={player.playerId}
              aria-label={`${player.name}: ${before} before, ${adjustment} adjustment, ${final} final`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
            >
              <span className="font-medium text-gray-900">{player.name}</span>
              <span aria-hidden className="whitespace-nowrap tabular-nums text-gray-600">
                {before} <span className="font-semibold text-gray-950">{adjustment}</span> → <span className="font-semibold text-gray-950">{final}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
