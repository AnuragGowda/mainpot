import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import type { Transfer } from "@/lib/settlement";

export interface TransferListProps {
  transfers: Transfer[];
}

/** A transfer party — either a player name or the literal "Bank". */
function PartyName({ name }: { name: string }) {
  if (name === "Bank") {
    return <Badge variant="gray">Bank</Badge>;
  }
  return <span className="font-medium text-gray-900">{name}</span>;
}

/**
 * Renders the list of settlement transfers ("[from] pays [to] amount").
 * Bank parties are rendered as gray badges to stand out from players.
 */
export default function TransferList({ transfers }: TransferListProps) {
  if (transfers.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No transfers needed — everyone is square.
      </p>
    );
  }

  return (
    <Card padding="none">
      <ul className="divide-y divide-gray-100">
        {transfers.map((transfer, index) => (
          <li
            key={index}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <PartyName name={transfer.from} />
              <span className="text-gray-500">pays</span>
              <PartyName name={transfer.to} />
            </div>
            <span className="shrink-0 font-semibold text-gray-900">
              {formatCurrency(transfer.amount)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}