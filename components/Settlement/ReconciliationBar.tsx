import Card from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import { Check, TriangleAlert } from "lucide-react";

export interface ReconciliationBarProps {
  totalBoughtIn: number;
  totalCashedOut: number;
  difference: number;
  balanced: boolean;
}

/**
 * Shows the reconciliation totals (buy-ins vs cash-outs) and a status line
 * indicating whether the books balance.
 */
export default function ReconciliationBar({
  totalBoughtIn,
  totalCashedOut,
  difference,
  balanced,
}: ReconciliationBarProps) {
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="grid grid-cols-3 divide-x divide-gray-100">
        <div className="min-w-0 px-3 py-4 sm:px-5">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
            Total bought in
          </p>
          <p className="mt-1 truncate text-base font-semibold text-gray-900 sm:text-lg">
            {formatCurrency(totalBoughtIn)}
          </p>
        </div>
        <div className="min-w-0 px-3 py-4 sm:px-5">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
            Total cashed out
          </p>
          <p className="mt-1 truncate text-base font-semibold text-gray-900 sm:text-lg">
            {formatCurrency(totalCashedOut)}
          </p>
        </div>
        <div className="min-w-0 px-3 py-4 sm:px-5">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
            Difference
          </p>
          <p
            className={[
              "mt-1 truncate text-base font-semibold sm:text-lg",
              balanced ? "text-gray-900" : "text-red-600",
            ].join(" ")}
          >
            {formatCurrency(balanced ? 0 : difference)}
          </p>
        </div>
      </div>

      <div className={`border-t px-4 py-3 sm:px-5 ${balanced ? "border-emerald-100 bg-emerald-50/70" : "border-red-100 bg-red-50/70"}`}>
        {balanced ? (
          <div>
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <Check aria-hidden className="h-4 w-4" />
              Bank reconciled
            </p>
            <p className="mt-1 text-xs leading-5 text-emerald-800/80">
              Every chip is accounted for. Next, calculate the payments; each player&apos;s result is their cash-out minus everything they bought in for.
            </p>
          </div>
        ) : (
          <div>
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700">
              <TriangleAlert aria-hidden className="h-4 w-4" />
              Cash-outs don&apos;t match buy-ins
            </p>
            <p className="mt-1 text-xs leading-5 text-red-800/80">
              {difference > 0
                ? `${formatCurrency(difference)} is still missing from the cash-out total. Recheck final stacks or add the missing cash-out.`
                : `${formatCurrency(Math.abs(difference))} more has been recorded as cash-outs than was bought in. Recheck final stacks or buy-ins.`} You can calculate anyway if the difference is intentional.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
