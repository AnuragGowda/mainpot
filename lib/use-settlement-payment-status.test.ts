import { afterEach, expect, it, vi } from "vitest";
import { canReadPaymentStatuses } from "./use-settlement-payment-status";

afterEach(() => vi.unstubAllGlobals());

it("allows an authoritative status read only while online and foregrounded", () => {
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("document", { visibilityState: "visible" });
  expect(canReadPaymentStatuses()).toBe(true);

  vi.stubGlobal("navigator", { onLine: false });
  expect(canReadPaymentStatuses()).toBe(false);

  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("document", { visibilityState: "hidden" });
  expect(canReadPaymentStatuses()).toBe(false);
});
