import { expect, type Browser } from "@playwright/test";
import { createDeviceContext } from "./device-context";

/** A non-host bank must see both collection and payout instructions. */
export async function runBankPlanFlow(browser: Browser, baseURL: string, evidencePrefix: string) {
  const contexts = await Promise.all([0, 1, 2].map(() => createDeviceContext(browser, { baseURL, reducedMotion: "reduce" })));
  const [host, winner, banker] = await Promise.all(contexts.map(context => context.newPage()));
  try {
    await host.goto("/create");
    await host.locator("#create-name").fill("Casey");
    await host.locator("#create-game-name").fill("Shared bank regression");
    await host.locator("#create-buy-in").fill("20");
    await host.getByRole("button", { name: "Create game", exact: true }).click();
    await expect(host.getByRole("heading", { name: "Shared bank regression" })).toBeVisible();
    for (const [page, name] of [[winner, "Jordan"], [banker, "Taylor"]] as const) {
      await page.goto(host.url());
      await page.locator("#join-prompt-name").fill(name);
      await page.getByRole("button", { name: "Join", exact: true }).click();
      await expect(page.locator("#join-prompt-name")).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByRole("heading", { name: "Shared bank regression" })).toBeVisible();
    }
    await host.getByRole("region", { name: "Needs approval" }).getByRole("button", { name: "Approve all" }).click();
    await host.getByRole("button", { name: "Add player", exact: true }).click();
    const add = host.getByRole("dialog", { name: "Add a player" });
    await add.getByRole("textbox", { name: "Player name" }).fill("Riley");
    await add.getByRole("button", { name: "Add player", exact: true }).click();
    await expect(add).toHaveCount(0);
    await host.getByRole("button", { name: "End game", exact: true }).click();
    await host.getByRole("button", { name: "Start cash-outs" }).click();
    for (const [name, amount] of [["Casey", "0"], ["Jordan", "40"], ["Taylor", "0"], ["Riley", "40"]]) {
      const input = host.getByRole("spinbutton", { name: `Cash-out amount for ${name}` });
      await input.fill(amount);
      await expect(input).toHaveValue(amount);
      await input.blur();
    }
    await expect(host.getByText("Bank reconciled", { exact: true })).toBeVisible();
    await host.getByRole("button", { name: "Review settlement" }).click();
    await host.getByRole("radio", { name: /Route net settlement through a player/ }).check();
    await host.locator("#final-bank-player-select").click();
    await host.getByRole("option", { name: "Taylor", exact: true }).click();
    await host.getByRole("button", { name: "Lock settlement", exact: true }).click();
    await host.getByRole("alertdialog").getByRole("button", { name: "Lock settlement" }).click();

    const personal = banker.locator('section[aria-labelledby="your-settlement-heading"]');
    await expect(personal.getByRole("heading")).toHaveText("Send $40.00 · collect $20.00.");
    await expect(personal).toContainText("From Casey");
    await expect(personal).toContainText("Jordan");
    await expect(personal).toContainText("Riley");
    await expect(winner.locator('section[aria-labelledby="your-settlement-heading"]')).toContainText("From Taylor");
    expect(await banker.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(banker.viewportSize()!.width);
    await expect(banker.getByRole("status").filter({ hasText: "Final settlement is ready to review." })).toHaveCount(0);
    await banker.screenshot({ path: `${evidencePrefix}-${banker.viewportSize()!.width}.png`, fullPage: true });
    await personal.getByTitle("Mark sent").first().click();
    await expect(personal.getByRole("heading")).toHaveText("Send $20.00 · collect $20.00.");
    await personal.getByTitle("Mark sent").first().click();
    await expect(personal.getByRole("heading")).toHaveText("$20.00 coming to you.");
    await expect(personal).toContainText("From Casey");
    await banker.reload();
    await expect(personal.getByRole("heading")).toHaveText("$20.00 coming to you.");
    await expect(banker.locator('[data-testid="payment-ledger"]')).toContainText("2 of 3 payments marked sent");
    await host.locator('section[aria-labelledby="your-settlement-heading"]').getByTitle("Mark sent").click();
    await expect(personal.getByRole("heading")).toHaveText("All your payments are marked sent.");
    await winner.reload();
    await expect(winner.locator('section[aria-labelledby="your-settlement-heading"]')).toContainText("All payments to you are marked sent.");
    await expect(winner.locator('[data-testid="payment-ledger"]')).toContainText("3 of 3 payments marked sent");
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
}
