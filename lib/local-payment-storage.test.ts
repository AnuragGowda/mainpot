import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSettlementPaymentStatuses, setSettlementPaymentStatus } from "./payments";

vi.mock("./supabase-browser", () => ({ getBrowserSupabase: () => null }));
let saved: string | null;
let denied = false;
beforeEach(() => {
  saved = null;
  denied = false;
  vi.stubGlobal("window", { localStorage: {
    getItem: () => { if (denied) throw new Error("Storage denied"); return saved; },
    setItem: (_key: string, value: string) => { saved = value; },
  }, dispatchEvent: vi.fn() });
});
describe("local payment read integrity", () => {
  it("distinguishes absent records from inaccessible or corrupt records", async () => {
    expect(await getSettlementPaymentStatuses("game")).toEqual([]);
    for (const value of ["invalid", "null", "{}", '[{"key":"k","settled":"true"}]']) {
      saved = value;
      await expect(getSettlementPaymentStatuses("game")).rejects.toThrow("Could not read payment status");
      expect(saved).toBe(value);
    }
    saved = '[{"key":"min:a:b:10.00","settled":true}]';
    denied = true;
    await expect(getSettlementPaymentStatuses("game")).rejects.toThrow("Could not read payment status");
    denied = false;
    expect(await getSettlementPaymentStatuses("game")).toEqual([{ key: "min:a:b:10.00", settled: true }]);
  });
  it("never overwrites sent records when their read fails", async () => {
    saved = '[{"key":"min:a:b:10.00","settled":true}]';
    denied = true;
    await expect(setSettlementPaymentStatus("game", "min", { fromPlayerId: "a", toPlayerId: "b", amount: 10 } as never, false)).rejects.toThrow();
    expect(saved).toBe('[{"key":"min:a:b:10.00","settled":true}]');
  });
});
