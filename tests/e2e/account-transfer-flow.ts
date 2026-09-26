import { expect, type Browser } from "@playwright/test";
import { createDeviceContext } from "./device-context";

/** Preserve an authenticated guest host's table when creating an account. */
export async function runGuestAccountTransfer(browser: Browser, baseURL: string) {
  const original = await createDeviceContext(browser, { baseURL });
  const fresh = await createDeviceContext(browser, { baseURL });
  const host = await original.newPage();
  const resumed = await fresh.newPage();
  const email = `guest-transfer-${crypto.randomUUID()}@example.com`;
  const password = `Transfer-${crypto.randomUUID()}`;
  try {
    await host.goto("/create");
    await host.locator("#create-name").fill("Guest Casey");
    await host.locator("#create-game-name").fill("Guest account recovery");
    await host.locator("#create-buy-in").fill("20");
    await host.getByRole("button", { name: "Create game", exact: true }).click();
    await expect(host.getByRole("heading", { name: "Guest account recovery" })).toBeVisible();
    const gameUrl = host.url();
    await host.goto("/signin");
    await host.getByRole("button", { name: "Create an account", exact: true }).click();
    await host.getByLabel("Display name", { exact: true }).fill("Guest Casey");
    await host.getByLabel("Email", { exact: true }).fill(email);
    await host.getByLabel("Password", { exact: true }).fill(password);
    await host.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(host).toHaveURL(/dashboard/);
    await expect(host.getByRole("region", { name: "Your unfinished games" })).toContainText("Guest account recovery");
    await resumed.goto("/signin");
    await resumed.getByLabel("Email", { exact: true }).fill(email);
    await resumed.getByLabel("Password", { exact: true }).fill(password);
    await resumed.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(resumed).toHaveURL(/dashboard/);
    await resumed.getByRole("region", { name: "Your unfinished games" }).getByRole("button", { name: "Resume game" }).click();
    await expect(resumed).toHaveURL(gameUrl);
    await expect(resumed.locator("#join-prompt-name")).toHaveCount(0);
    await expect(resumed.getByRole("button", { name: "End game", exact: true })).toBeEnabled();
    await resumed.getByRole("button", { name: "Add a rebuy" }).click();
    await resumed.getByRole("spinbutton", { name: "Rebuy amount" }).fill("5");
    await resumed.getByRole("button", { name: "Add rebuy", exact: true }).click();
    await expect(resumed.getByRole("region", { name: "Needs approval" })).toHaveCount(0);
    await expect(resumed.getByText("Pot", { exact: true }).locator("..")).toContainText("$25.00");
  } finally {
    await original.close();
    await fresh.close();
  }
}

/** An expired recovery proof must leave the new account usable without a retry loop. */
export async function runExpiredGuestRecoveryWindowFlow(browser: Browser, baseURL: string) {
  const context = await createDeviceContext(browser, { baseURL });
  const page = await context.newPage();
  const email = `expired-guest-transfer-${crypto.randomUUID()}@example.com`;
  const password = `Expired-${crypto.randomUUID()}`;
  try {
    await page.goto("/signin");
    await page.getByRole("button", { name: "Create an account", exact: true }).click();
    await page.getByLabel("Display name", { exact: true }).fill("Expired Casey");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);

    await page.evaluate(() => window.sessionStorage.setItem("mainpot_account_transfer", "0".repeat(64)));
    await page.goto("/signin?next=%2Fdashboard&account_recovery=failed");
    await expect(page.getByText("Retry recovery from the same browser where you played as a guest.")).toBeVisible();
    await page.getByRole("button", { name: "Retry guest recovery" }).click();
    await expect(page.getByRole("heading", { name: "You're signed in" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Your guest-game recovery window expired." })).toContainText("Your guest-game recovery window expired.");
    await expect(page.getByText("Guest games can only be recovered within one hour after requesting the confirmation email, from the same browser.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry guest recovery" })).toHaveCount(0);
    await expect(page.getByText("Retry recovery from the same browser where you played as a guest.")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("mainpot_account_transfer"))).toBeNull();
    await page.getByRole("button", { name: "Continue to your account" }).click();
    await expect(page).toHaveURL(/dashboard/);
  } finally {
    await context.close();
  }
}
