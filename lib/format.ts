const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/**
 * Formats a number as USD currency. Non-numbers and NaN fall back to $0.00.
 */
export function formatCurrency(amount: number): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return currencyFormatter.format(0);
  }
  return currencyFormatter.format(amount);
}