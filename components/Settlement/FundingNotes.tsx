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
  }).reduce<{
    borrower: GameSnapshot["players"][number];
    lender: GameSnapshot["players"][number];
    amount: number;
    entryCount: number;
  }[]>((current, { buyIn, borrower, lender }) => {
    const existing = current.find(
      (entry) => entry.borrower.id === borrower.id && entry.lender.id === lender.id,
    );
    if (existing) {
      existing.amount += buyIn.amount;
      existing.entryCount += 1;
    } else {
      current.push({ borrower, lender, amount: buyIn.amount, entryCount: 1 });
    }
    return current;
  }, []);

  if (!entries.length) return null;

  return (
    <section aria-labelledby="funding-notes-heading">
      <div className="mb-2 flex items-end justify-between gap-4">
        <h2 id="funding-notes-heading" className="text-sm font-medium uppercase tracking-widest text-gray-500">
          Cash advances to settle
        </h2>
        <span className="text-xs text-gray-400">Doesn&apos;t change the pot</span>
      </div>
      <Card padding="none" className="divide-y divide-gray-100 overflow-hidden">
        {entries.map(({ borrower, lender, amount, entryCount }) => (
          <div key={`${borrower.id}-${lender.id}`} className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <p className="text-sm text-gray-700">
                <span className="font-medium text-gray-950">{lender.name}</span> covered cash for <span className="font-medium text-gray-950">{borrower.name}</span>
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {borrower.name} repays {lender.name} in the final settlement{entryCount > 1 ? ` · ${entryCount} entries combined` : ""}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-gray-950">
              {formatCurrency(amount)}
            </p>
          </div>
        ))}
      </Card>
      <p className="mt-2 text-xs leading-5 text-gray-400">
        These repayments are added to the final payment plan; buy-ins, chips, and the pot are unchanged.
      </p>
    </section>
  );
}
