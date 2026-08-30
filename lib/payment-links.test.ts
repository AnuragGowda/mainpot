import { describe, expect, it } from "vitest";
import { buildVenmoPaymentUrl, buildZellePaymentText } from "./payment-links";

describe("payment links", () => {
  it("builds a reviewable Venmo payment link", () => {
    expect(buildVenmoPaymentUrl("@river-kim", 42.5)).toBe(
      "https://venmo.com/river-kim?txn=pay&amount=42.50&note=Mainpot+settlement"
    );
  });

  it("builds copyable Zelle instructions", () => {
    expect(buildZellePaymentText("player@example.com", 18)).toBe(
      "Send $18.00 with Zelle to player@example.com — Mainpot settlement"
    );
  });

  it("rejects incomplete payment details", () => {
    expect(buildVenmoPaymentUrl("", 10)).toBeNull();
    expect(buildZellePaymentText("555-123-4567", 0)).toBeNull();
  });
});
