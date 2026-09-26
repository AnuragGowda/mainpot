import { expect, type Page, type Browser } from "@playwright/test";
import { createDeviceContext } from "./device-context";

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
  try {
    await host.goto("/signin");
    await host.getByRole("button", { name: "Create an account", exact: true }).click();
    await host.getByLabel("Display name", { exact: true }).fill("Casey");
    await host.getByLabel("Email", { exact: true }).fill(email);
    await host.getByLabel("Password", { exact: true }).fill(password);
    await host.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(host).toHaveURL(/dashboard/);
    await host.goto("/create");
    await host.locator("#create-name").fill("Casey");
    await host.locator("#create-game-name").fill("Recovery regression");
    await host.locator("#create-buy-in").fill("20");
    await host.getByRole("button", { name: "Create game", exact: true }).click();
    await expect(host.getByRole("button", { name: "End game", exact: true })).toBeVisible();
    const gameUrl = host.url();
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
    await expect(resumed.getByText("No settled games yet", { exact: true })).toHaveCount(0);
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
    await resumed.reload();
    await resumed.getByText("Account data and deletion", { exact: true }).click();
    await expect(resumed.getByText(/Your deletion request is/)).toContainText("pending");
    await expect(resumed.getByRole("button", { name: "Request account deletion", exact: true })).toHaveCount(0);
    await expect(resumed.getByRole("button", { name: "Export my data" })).toBeEnabled();
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
    await host.getByRole("button", { name: "Invite players", exact: true }).click();
    await host.getByRole("dialog").getByRole("button", { name: "Invite", exact: true }).click();
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
