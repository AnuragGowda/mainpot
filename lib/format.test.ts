import { describe, expect, it } from "vitest";
import { formatCurrency, formatSignedNet, round2 } from "./format";

describe("currency formatting", () => {
  it("normalizes negative zero and sub-cent differences", () => {
    expect(formatCurrency(-0)).toBe("$0.00");
    expect(formatCurrency(-0.004)).toBe("$0.00");
    expect(formatSignedNet(-0.004)).toBe("$0.00");
  });

  it("keeps meaningful negative values", () => {
    expect(formatCurrency(-0.01)).toBe("-$0.01");
  });

  it("rounds reconciliation differences to cents", () => {
    expect(round2(40 - 39.999)).toBe(0);
  });
});
