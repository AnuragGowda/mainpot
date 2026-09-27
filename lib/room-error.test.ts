import { expect, it } from "vitest";
import { roomErrorSupportCode } from "./room-error";

it("identifies the incident without exposing raw room identifiers or errors", () => {
  const error = new Error("cannot add postgres_changes callbacks for realtime:settlement-payment-status-private-room-id after subscribe()");
  expect(roomErrorSupportCode(error, "fcd98c39150f73ee")).toBe("mp-live-updates-fcd98c3");
});

it("keeps arbitrary private error details and malformed version strings out of support codes", () => {
  expect(roomErrorSupportCode(new Error("private payment information"), "private-build-information")).toBe("mp-room-screen-unknown");
});
