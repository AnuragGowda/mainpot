import Card from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import { Check, TriangleAlert } from "lucide-react";

export interface ReconciliationBarProps {
  totalBoughtIn: number;
  totalCashedOut: number;
  difference: number;
  balanced: boolean;
  cashOutCount: number;
  playerCount: number;
  showProgress?: boolean;
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
  cashOutCount,
  playerCount,
  showProgress = true,
}: ReconciliationBarProps) {
  const complete = cashOutCount >= playerCount;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="grid grid-cols-3 divide-x divide-gray-100">
        <div className="min-w-0 px-3 py-4 sm:px-5">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
            Bought in
          </p>
          <p className="mt-1 truncate text-base font-semibold text-gray-900 sm:text-lg">
            {formatCurrency(totalBoughtIn)}
          </p>
        </div>
        <div className="min-w-0 px-3 py-4 sm:px-5">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
            Cash-outs
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
              !complete || balanced ? "text-gray-900" : "text-red-600",
            ].join(" ")}
          >
            {formatCurrency(balanced ? 0 : difference)}
          </p>
        </div>
      </div>

      {complete || showProgress ? <div className={`border-t px-4 py-3 sm:px-5 ${!complete || balanced ? "border-gray-100 bg-gray-50/80" : "border-amber-100 bg-amber-50/60"}`}>
        {!complete ? (
          <div>
            <p className="text-sm font-medium text-gray-700">
              {cashOutCount} of {playerCount} cash-outs entered
            </p>
          </div>
        ) : balanced ? (
          <div>
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900">
              <Check aria-hidden className="h-4 w-4" />
              Bank reconciled
            </p>
          </div>
        ) : (
          <div>
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-900">
              <TriangleAlert aria-hidden className="h-4 w-4" />
              {formatCurrency(Math.abs(difference))} {difference > 0 ? "short in cash-outs" : "extra in cash-outs"}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-900">
              Recheck the entries, or agree how to allocate the difference.
            </p>
          </div>
        )}
      </div> : null}
    </Card>
  );
}
