/** Matches the numeric(10,2) range used by the shared ledger. */
export const MAX_CURRENCY_AMOUNT = 99_999_999.99;

/** Reject invalid money before rounding or persisting it. Blank is optional only in worksheets. */
export function validateCurrencyAmount(
  value: string | number,
  { allowZero = true, allowBlank = false } = {},
): string | null {
  const raw = String(value).trim();
  if (!raw) return allowBlank ? null : "Enter an amount.";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return "Enter a valid amount.";
  if (parsed < 0 || (!allowZero && parsed === 0)) {
    return allowZero ? "Enter 0 or a positive amount." : "Enter an amount of at least $0.01.";
  }
  if (parsed > MAX_CURRENCY_AMOUNT) return "Enter an amount no greater than $99,999,999.99.";
  if (typeof value === "string" && !/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(raw)) {
    return "Use a decimal amount with no more than two decimal places.";
  }
  if (Math.abs(parsed * 100 - Math.round(parsed * 100)) > 0.000001) {
    return "Use no more than two decimal places.";
  }
  if (!allowZero && parsed < 0.01) return "Enter an amount of at least $0.01.";
  return null;
}
