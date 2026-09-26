import { expect, type Browser } from "@playwright/test";

/** Preserve an authenticated guest host's table when creating an account. */
export async function runGuestAccountTransfer(browser: Browser, baseURL: string) {
  const original = await browser.newContext({ baseURL });
  const fresh = await browser.newContext({ baseURL });
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
