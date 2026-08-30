import Card from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import type { GameSnapshot } from "@/lib/types";

export default function FundingNotes({ snapshot }: { snapshot: GameSnapshot }) {
  const entries = snapshot.buyIns.flatMap((buyIn) => {
    if (!buyIn.fronted_by_player_id || buyIn.fronted_by_player_id === buyIn.player_id) {
      return [];
    }
    const borrower = snapshot.players.find((player) => player.id === buyIn.player_id);
    const lender = snapshot.players.find(
      (player) => player.id === buyIn.fronted_by_player_id
    );
    if (!borrower || !lender) return [];
    return [{ buyIn, borrower, lender }];
  });

  if (!entries.length) return null;

  return (
    <section aria-labelledby="funding-notes-heading">
      <div className="mb-2 flex items-end justify-between gap-4">
        <h2 id="funding-notes-heading" className="text-sm font-medium uppercase tracking-widest text-gray-500">
          Fronted buy-ins
        </h2>
        <span className="text-xs text-gray-400">Settlement only</span>
      </div>
      <Card padding="none" className="divide-y divide-gray-100 overflow-hidden">
        {entries.map(({ buyIn, borrower, lender }) => (
          <div key={buyIn.id} className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
            <p className="text-sm text-gray-700">
              <span className="font-medium text-gray-950">{borrower.name}</span> owes {lender.name}
            </p>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-gray-950">
              {formatCurrency(buyIn.amount)}
            </p>
          </div>
        ))}
      </Card>
      <p className="mt-2 text-xs leading-5 text-gray-400">
        Included in final payments without changing the pot or chip ledger.
      </p>
    </section>
  );
}
