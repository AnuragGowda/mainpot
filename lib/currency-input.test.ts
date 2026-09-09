import { describe, expect, it } from "vitest";
import { MAX_CURRENCY_AMOUNT, validateCurrencyAmount } from "./currency-input";

describe("currency inputs", () => {
  it.each(["0.01", "20", "20.25", ".29", "0", 0.29, MAX_CURRENCY_AMOUNT])("accepts exact cents: %s", (value) => {
    expect(validateCurrencyAmount(value)).toBeNull();
  });
  it.each(["-20", "0.001", "1.234", "1e2", "NaN", "Infinity", "12abc", "1,000", 0.001, Infinity, NaN, 100_000_000])("rejects invalid input: %s", (value) => {
    expect(validateCurrencyAmount(value)).not.toBeNull();
  });
  it("distinguishes blank worksheet amounts from required buy-ins", () => {
    expect(validateCurrencyAmount("", { allowBlank: true })).toBeNull();
    expect(validateCurrencyAmount(0, { allowZero: false })).not.toBeNull();
    expect(validateCurrencyAmount("", { allowZero: false })).not.toBeNull();
  });
});
