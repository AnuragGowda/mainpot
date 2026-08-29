import Card from "@/components/ui/Card";
import { formatCurrency, formatSignedNet } from "@/lib/format";
import type { PlayerNet } from "@/lib/settlement";

export interface NetListProps {
  nets: PlayerNet[];
  /** When set, the bank player is excluded from the main list and called
   *  out explicitly with a footer line. */
  bankPlayerId?: string;
  /** The residual the bank should display (difference = bought in - cashed
   *  out). When omitted, the footer shows $0.00 even. */
  bankResidual?: number;
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
 *
 * In bank mode (`bankPlayerId` set) the bank player is filtered out of the
 * main list — their residual is shown once in the footer instead, so a
 * balanced bank renders "$0.00 even" instead of duplicating its min-transfer
 * net in both places.
 */
export default function NetList({
  nets,
  bankPlayerId,
  bankResidual,
}: NetListProps) {
  if (nets.length === 0) {
    return <p className="text-sm text-gray-500">No players.</p>;
  }

  const bank = bankPlayerId
    ? (nets.find((net) => net.playerId === bankPlayerId) ?? null)
    : null;
  const bankMeta = bankPlayerId ? netMeta(bankResidual ?? 0) : null;

  return (
    <Card padding="none">
      <ul className="divide-y divide-gray-100">
        {nets
          .filter((net) => net.playerId !== bankPlayerId)
          .map((net) => {
            const meta = netMeta(net.net);
            return (
              <li
                key={net.playerId}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900">{net.name}</span>
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

      {bankMeta ? (
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-gray-900">
              Bank{bank ? ` (${bank.name})` : ""}
            </span>
            <div className="shrink-0 text-right">
              <p className={`font-semibold ${bankMeta.amountClass}`}>
                {bankMeta.amount}
              </p>
              <p className="text-xs text-gray-500">{bankMeta.caption}</p>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}