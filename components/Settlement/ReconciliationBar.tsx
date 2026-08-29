import Card from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";

export interface ReconciliationBarProps {
  totalBoughtIn: number;
  totalCashedOut: number;
  difference: number;
  balanced: boolean;
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        clipRule="evenodd"
      />
    </svg>
  );
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
    <Card padding="md">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
            Total bought in
          </p>
          <p className="mt-1 truncate text-base font-semibold text-gray-900 sm:text-lg">
            {formatCurrency(totalBoughtIn)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
            Total cashed out
          </p>
          <p className="mt-1 truncate text-base font-semibold text-gray-900 sm:text-lg">
            {formatCurrency(totalCashedOut)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
            Difference
          </p>
          <p
            className={[
              "mt-1 truncate text-base font-semibold sm:text-lg",
              balanced ? "text-gray-900" : "text-red-600",
            ].join(" ")}
          >
            {formatCurrency(difference)}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-3">
        {balanced ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <CheckIcon />
            Balanced!
          </p>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600">
            <WarningIcon />
            Cash-outs don&apos;t match buy-ins. Check the amounts.
          </p>
        )}
      </div>
    </Card>
  );
}