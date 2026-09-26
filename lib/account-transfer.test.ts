import { describe, expect, it } from "vitest";
import { isExpiredAccountTransferError } from "./account-transfer";

describe("account transfer expiry classification", () => {
  it("only treats the server expiry result as terminal", () => {
    expect(isExpiredAccountTransferError("The guest transfer token is invalid or expired")).toBe(true);
    expect(isExpiredAccountTransferError("This guest transfer belongs to a different account email")).toBe(false);
    expect(isExpiredAccountTransferError("Guest recovery timed out. Please try again.")).toBe(false);
  });
});
