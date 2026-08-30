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
  const normalizedAmount = Math.abs(amount) < 0.005 ? 0 : amount;
  return currencyFormatter.format(normalizedAmount);
}

/** Rounds a number to 2 decimal places (half away from zero via Math.round). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Formats a net amount with an explicit sign: "+$50.00" for positive nets,
 * "-$30.00" for negative nets, and "$0.00" for (near) zero.
 */
export function formatSignedNet(net: number): string {
  if (!Number.isFinite(net) || Math.abs(net) < 0.005) {
    return currencyFormatter.format(0);
  }
  return net > 0
    ? `+${currencyFormatter.format(net)}`
    : `-${currencyFormatter.format(Math.abs(net))}`;
}
