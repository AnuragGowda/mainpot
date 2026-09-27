import { expect, test, type Page, type Browser } from "@playwright/test";
import { createDeviceContext } from "./device-context";
import { writeFile } from "node:fs/promises";
import { failureDiagnostics } from "./failure-diagnostics";

export async function checkCalculatorValidation(page: Page) {
  await page.goto("/poker-settlement-calculator");
  await page.getByRole("button", { name: "Clear example" }).click();
  const amount = page.getByLabel("Money in for player 1", { exact: true });
  const result = page.locator("#calculator-results");
  for (const invalid of ["-20", "0.001", "Infinity", "1e2", "100000000"]) {
    await amount.fill(invalid);
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(result).toContainText("Correct the highlighted amounts");
    await expect(result).not.toContainText("Bank balanced");
    await expect(result).not.toContainText("No payments needed");
  }
  await amount.fill("20");
  await page.getByLabel("Final stack for player 1", { exact: true }).fill("20");
  await page.getByLabel("Money in for player 2", { exact: true }).fill("0");
  await page.getByLabel("Final stack for player 2", { exact: true }).fill("0");
  await expect(amount).toHaveAttribute("aria-invalid", "false");
  await expect(result).toContainText("Bank balanced");
}

export async function checkAccountRecovery(browser: Browser, baseURL: string) {
  const first = await createDeviceContext(browser, { baseURL, reducedMotion: "reduce" });
  const second = await createDeviceContext(browser, { baseURL, reducedMotion: "reduce" });
  const host = await first.newPage();
  const resumed = await second.newPage();
  const email = `recovery-${crypto.randomUUID()}@example.com`;
  const password = `Recovery-${crypto.randomUUID()}`;
  const diagnostics = failureDiagnostics([host, resumed]);
  await host.addInitScript(() => {
    const events: { event: string; at: number; node: number | null; value: string | null; disabled: boolean | null; trusted?: boolean }[] = [];
    (window as unknown as { __mainpotCreateInputEvents: typeof events }).__mainpotCreateInputEvents = events;
    const nodes = new WeakMap<HTMLInputElement, number>();
    let nextNode = 0;
    let lastSnapshot = "";
    const sample = (event: string, trusted?: boolean) => {
      const element = document.getElementById("create-buy-in");
      const input = element instanceof HTMLInputElement ? element : null;
      if (input && !nodes.has(input)) nodes.set(input, ++nextNode);
      const state = { node: input ? nodes.get(input)! : null, value: input?.value ?? null, disabled: input?.disabled ?? null };
      const snapshot = JSON.stringify(state);
      if (event === "mutation" && snapshot === lastSnapshot) return;
      lastSnapshot = snapshot;
      events.push({ event, at: Math.round(performance.now()), ...state, ...(trusted === undefined ? {} : { trusted }) });
      if (events.length > 100) events.shift();
    };
    for (const type of ["input", "change", "focus", "blur"]) {
      document.addEventListener(type, event => {
        if (event.target instanceof HTMLInputElement && event.target.id === "create-buy-in") sample(type, event.isTrusted);
      }, true);
    }
    new MutationObserver(() => sample("mutation")).observe(document, {
      subtree: true, childList: true, attributes: true, attributeFilter: ["value", "disabled"],
    });
  });
  try {
    diagnostics.setPhase("account signup");
    await host.goto("/signin");
    await host.getByRole("button", { name: "Create an account", exact: true }).click();
    await host.getByLabel("Display name", { exact: true }).fill("Casey");
    await host.getByLabel("Email", { exact: true }).fill(email);
    await host.getByLabel("Password", { exact: true }).fill(password);
    await host.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(host).toHaveURL(/dashboard/);
    diagnostics.setPhase("create recovery game");
    await host.goto("/create");
    await host.locator("#create-name").fill("Casey");
    await expect(host.locator("#create-name")).toHaveValue("Casey");
    await host.locator("#create-game-name").fill("Recovery regression");
    await expect(host.locator("#create-game-name")).toHaveValue("Recovery regression");
    await host.locator("#create-buy-in").fill("20");
    await expect(host.locator("#create-buy-in")).toHaveValue("20");
    await expect(host.locator("#create-game-name")).toHaveValue("Recovery regression");
    await host.getByRole("button", { name: "Create game", exact: true }).click();
    await expect(host.getByRole("button", { name: "End game", exact: true })).toBeVisible();
    const gameUrl = host.url();
    diagnostics.setPhase("second browser password sign-in");
    await resumed.goto("/signin");
    await resumed.getByLabel("Email", { exact: true }).fill(email);
    await resumed.getByLabel("Password", { exact: true }).fill(password);
    await resumed.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(resumed).toHaveURL(/dashboard/);
    const unfinished = resumed.getByRole("region", { name: "Your unfinished games" });
    await expect(unfinished).toContainText("Recovery regression");
    expect(await resumed.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(resumed.viewportSize()!.width);
    await resumed.screenshot({ path: `docs/audits/2026-09-26/evidence/dashboard-resume-${resumed.viewportSize()!.width}.png`, fullPage: true });
    await unfinished.getByRole("button", { name: "Resume game" }).click();
    await expect(resumed).toHaveURL(gameUrl);
    await expect(resumed.getByRole("button", { name: "End game", exact: true })).toBeVisible();
    await expect(resumed.locator("#join-prompt-name")).toHaveCount(0);
    // The recovered host can mutate and remains the same seat in the first browser.
    await resumed.getByRole("button", { name: "End game", exact: true }).click();
    await resumed.getByRole("button", { name: "Start cash-outs" }).click();
    const cashout = resumed.getByRole("spinbutton", { name: "Cash-out amount for Casey" });
    await cashout.fill("20");
    await cashout.blur();
    await expect(host.getByText("Bank reconciled", { exact: true })).toBeVisible();
    await resumed.getByRole("button", { name: "Review settlement" }).click();
    await resumed.getByRole("button", { name: "Lock settlement", exact: true }).click();
    await resumed.getByRole("alertdialog").getByRole("button", { name: "Lock settlement" }).click();
    await expect(resumed.getByRole("heading", { name: "You're even.", exact: true })).toBeVisible();
    await resumed.goto("/dashboard");
    await expect(resumed.getByRole("region", { name: "Your unfinished games" })).toHaveCount(0);
    // An optional endpoint failure must not hide history or the user's profile.
    await resumed.route("**/rest/v1/account_deletion_requests**", route => route.fulfill({
      status: 400, contentType: "application/json", body: JSON.stringify({ message: "Injected optional section failure" }),
    }));
    await resumed.reload();
    await expect(resumed.getByText("Some dashboard sections are unavailable")).toBeVisible();
    await expect(resumed.getByRole("heading", { name: "Casey", exact: true })).toBeVisible();
    await expect(resumed.getByText("No final results yet", { exact: true })).toHaveCount(0);
    await expect(resumed.getByRole("button", { name: "Request account deletion", exact: true })).toHaveCount(0);
    await resumed.unroute("**/rest/v1/account_deletion_requests**");
    await resumed.getByRole("button", { name: "Retry dashboard" }).click();
    await expect(resumed.getByText("Some dashboard sections are unavailable")).toHaveCount(0);
    await resumed.getByRole("link", { name: "Recovery regression", exact: true }).click();
    await expect(resumed.getByRole("heading", { name: "You're even.", exact: true })).toBeVisible();
    await expect(resumed.getByRole("button", { name: "End game", exact: true })).toHaveCount(0);
    await resumed.goto("/dashboard");
    await resumed.getByText("Account data and deletion", { exact: true }).click();
    await resumed.getByRole("button", { name: "Request account deletion", exact: true }).click();
    await resumed.getByRole("alertdialog").getByRole("button", { name: "Request deletion", exact: true }).click();
    await expect(resumed.getByText(/Your deletion request is/)).toContainText("pending");
    await resumed.reload();
    await resumed.getByText("Account data and deletion", { exact: true }).click();
    await expect(resumed.getByText(/Your deletion request is/)).toContainText("pending");
    await expect(resumed.getByRole("button", { name: "Request account deletion", exact: true })).toHaveCount(0);
    await expect(resumed.getByRole("button", { name: "Export my data" })).toBeEnabled();
  } catch (error) {
    const createInput = await host.evaluate(() =>
      (window as unknown as { __mainpotCreateInputEvents?: unknown[] }).__mainpotCreateInputEvents ?? [],
    ).catch(() => []);
    // Capture only the numeric setup field and sanitized request metadata.
    // Auth form values, browser storage and raw snapshots never enter this file.
    try {
      await writeFile(test.info().outputPath("network-diagnostics.json"), JSON.stringify({ ...diagnostics.report(), createInput }, null, 2));
    } catch { /* Retain the triggering assertion as the primary failure. */ }
    throw error;
  } finally {
    await first.close();
    await second.close();
  }
}

export async function checkSavedFriendInvitation(browser: Browser, baseURL: string) {
  const contexts = await Promise.all([createDeviceContext(browser, { baseURL }), createDeviceContext(browser, { baseURL })]);
  const [host, friend] = await Promise.all(contexts.map(context => context.newPage()));
  const names = [`Host ${Date.now()}`, `Friend ${Date.now()}`];
  try {
    for (const [index, page] of [host, friend].entries()) {
      await page.goto("/signin");
      await page.getByRole("button", { name: "Create an account", exact: true }).click();
      await page.getByLabel("Display name", { exact: true }).fill(names[index]);
      await page.getByLabel("Email", { exact: true }).fill(`invite-${crypto.randomUUID()}@example.com`);
      await page.getByLabel("Password", { exact: true }).fill(`Invite-${crypto.randomUUID()}`);
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      await expect(page).toHaveURL(/dashboard/);
    }
    await host.goto("/friends");
    await host.getByRole("textbox", { name: "Find a player" }).fill(names[1]);
    await host.getByRole("button", { name: "Search", exact: true }).click();
    await host.getByRole("button", { name: "Add", exact: true }).click();
    await expect(host.getByText("Sent requests · 1", { exact: true })).toBeVisible();
    await friend.goto("/friends");
    await friend.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(friend.getByText("Friends · 1", { exact: true })).toBeVisible();
    await host.goto("/create");
    await host.locator("#create-name").fill(names[0]);
    await host.locator("#create-game-name").fill("Invited game regression");
    await host.locator("#create-buy-in").fill("20");
    await host.getByRole("button", { name: "Create game", exact: true }).click();
    let releaseFriends!: () => void;
    const friendsGate = new Promise<void>((resolve) => { releaseFriends = resolve; });
    await host.route("**/rest/v1/friendships**", async route => {
      await friendsGate;
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "Injected friend-list failure" }) });
    });
    await host.getByRole("button", { name: "Invite players", exact: true }).click();
    const inviteDialog = host.getByRole("dialog");
    try {
      await expect(inviteDialog.getByRole("status")).toContainText("Loading saved friends");
      await expect(inviteDialog.getByText("Add friends", { exact: true })).toHaveCount(0);
    } finally { releaseFriends(); }
    await expect(inviteDialog.getByRole("alert")).toContainText("Saved friends could not load.");
    await host.unroute("**/rest/v1/friendships**");
    await inviteDialog.getByRole("button", { name: "Retry friends", exact: true }).click();
    await inviteDialog.getByRole("button", { name: "Invite", exact: true }).click();
    await expect(host.getByRole("dialog").getByRole("button", { name: "Invited", exact: true })).toBeVisible();
    await friend.goto("/dashboard");
    const invitation = friend.getByRole("region", { name: "Game invitations" });
    await expect(invitation).toContainText("Invited game regression");
    await expect(invitation).toContainText("$20.00");
    await invitation.getByRole("button", { name: "Join table", exact: true }).click();
    await expect(friend).toHaveURL(/\/game\/[A-HJ-NP-Z2-9]{6}$/);
    await friend.locator("#join-prompt-name").fill(names[1]);
    await friend.getByRole("button", { name: "Join", exact: true }).click();
    await expect(friend.getByRole("heading", { name: "Invited game regression", exact: true })).toBeVisible();
    await expect(friend.getByRole("button", { name: "End game", exact: true })).toHaveCount(0);
    await host.keyboard.press("Escape");
    await expect(host.getByRole("region", { name: "At the table" })).toContainText(names[1]);
  } finally {
    for (const context of contexts) await context.close();
  }
}
