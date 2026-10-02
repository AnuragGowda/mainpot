import { expect, it } from "vitest";
import { isHandledNavigationReadError, type ReadLifecycleEvent } from "../tests/e2e/navigation-fetch-errors";

const error = { device: 1, at: 100, navigation: 1 };
const lifecycle: ReadLifecycleEvent[] = [
  { device: 1, at: 100, event: "fetch-rejected", document: 10, path: "/auth/v1/user", method: "GET", name: "TypeError" },
  { device: 1, at: 110, event: "pagehide", document: 10 },
  { device: 1, at: 180, event: "pageshow", document: 20 },
  { device: 1, at: 200, event: "fetch-completed", document: 20, path: "/auth/v1/user", method: "GET", status: 200 },
];

it("requires a handled auth rejection and replacement of the same departing document", () => {
  expect(isHandledNavigationReadError(error, "/auth/v1/user", lifecycle)).toBe(true);
  expect(isHandledNavigationReadError(error, null, lifecycle)).toBe(false);
  expect(isHandledNavigationReadError(error, "/rest/v1/settlement_payments", lifecycle)).toBe(false);
  expect(isHandledNavigationReadError({ ...error, navigation: null }, "/auth/v1/user", lifecycle)).toBe(false);
  expect(isHandledNavigationReadError({ ...error, device: 2 }, "/auth/v1/user", lifecycle)).toBe(false);
  expect(isHandledNavigationReadError({ ...error, at: 1_000 }, "/auth/v1/user", lifecycle)).toBe(false);
  expect(isHandledNavigationReadError(error, "/auth/v1/user", lifecycle.slice(0, 1))).toBe(false);
  expect(isHandledNavigationReadError(error, "/auth/v1/user", lifecycle.slice(0, 3))).toBe(false);
  expect(isHandledNavigationReadError(error, "/auth/v1/user", lifecycle.map(event => ({ ...event, status: 401 })))).toBe(false);
  expect(isHandledNavigationReadError(error, "/auth/v1/user", lifecycle.map(event => ({ ...event, document: 10 })))).toBe(false);
  expect(isHandledNavigationReadError(error, "/auth/v1/user", lifecycle.map(event => event.event === "fetch-rejected" ? { ...event, name: "Error" } : event))).toBe(false);
});

it.each(["window-error", "unhandled-rejection"])("never classifies an actual %s as a handled transport rejection", event => {
  expect(isHandledNavigationReadError(error, "/auth/v1/user", [
    ...lifecycle, { device: 1, at: 105, event, document: 10 },
  ])).toBe(false);
});

it("requires a read method and a successful new-document payment read for payment transport errors", () => {
  const paymentLifecycle = lifecycle.map(event => ({ ...event,
    path: event.path ? "/rest/v1/settlement_payments" : undefined,
  }));
  expect(isHandledNavigationReadError(error, "/rest/v1/settlement_payments", paymentLifecycle)).toBe(true);
  expect(isHandledNavigationReadError(error, "/rest/v1/settlement_payments", paymentLifecycle.map(event => ({ ...event, method: "POST" })))).toBe(false);
  expect(isHandledNavigationReadError(error, "/rest/v1/settlement_payments", paymentLifecycle.slice(0, 3))).toBe(false);
});
