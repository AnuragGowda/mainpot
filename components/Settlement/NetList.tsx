import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { formatCurrency, formatSignedNet } from "@/lib/format";
import type { PlayerNet } from "@/lib/settlement";

export interface NetListProps {
  nets: PlayerNet[];
  /** When set, the bank's net is called out explicitly with a footer line. */
  bankPlayerId?: string;
  /** Whether the books are balanced (controls the bank footer note). */
  balanced?: boolean;
}

interface NetMeta {
  amount: string;
  caption: string;
  amountClass: string;
}

function netMeta(net: number): NetMeta {
  if (net > 0.005) {
    return {
      amount: formatSignedNet(net),
      caption: `up ${formatCurrency(net)}`,
      amountClass: "text-emerald-600",
    };
  }
  if (net < -0.005) {
    return {
      amount: formatSignedNet(net),
      caption: `down ${formatCurrency(Math.abs(net))}`,
      amountClass: "text-red-600",
    };
  }
  return {
    amount: formatSignedNet(net),
    caption: "even",
    amountClass: "text-gray-400",
  };
}

/**
 * Per-player net result list: green "+$X" / red "-$X" / gray "$0.00",
 * each with an "up $X" / "down $X" / "even" caption.
 */
export default function NetList({
  nets,
  bankPlayerId,
  balanced,
}: NetListProps) {
  if (nets.length === 0) {
    return <p className="text-sm text-gray-500">No players.</p>;
  }

  const bank = bankPlayerId
    ? (nets.find((net) => net.playerId === bankPlayerId) ?? null)
    : null;

  return (
    <Card padding="none">
      <ul className="divide-y divide-gray-100">
        {nets.map((net) => {
          const meta = netMeta(net.net);
          return (
            <li
              key={net.playerId}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium text-gray-900">{net.name}</span>
                {bank && net.playerId === bank.playerId ? (
                  <Badge variant="gray">Bank</Badge>
                ) : null}
              </span>
              <div className="shrink-0 text-right">
                <p className={`font-semibold ${meta.amountClass}`}>
                  {meta.amount}
                </p>
                <p className="text-xs text-gray-500">{meta.caption}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {bank ? (
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-gray-900">
              Bank ({bank.name})
            </span>
            <div className="shrink-0 text-right">
              {balanced ? (
                <>
                  <p className="font-semibold text-gray-400">
                    {formatCurrency(0)}
                  </p>
                  <p className="text-xs text-gray-500">even</p>
                </>
              ) : (
                <>
                  <p
                    className={`font-semibold ${netMeta(bank.net).amountClass}`}
                  >
                    {netMeta(bank.net).amount}
                  </p>
                  <p className="text-xs text-gray-500">
                    {netMeta(bank.net).caption}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}