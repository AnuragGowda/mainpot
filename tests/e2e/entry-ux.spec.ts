import { expect, test } from "@playwright/test";

test.describe("entry and calculator safeguards", () => {
  test.use({ serviceWorkers: "block" });

  test("keeps local-only failures actionable without discarding a typed join request", async ({ browser }) => {
    const hostContext = await browser.newContext({ serviceWorkers: "block" });
    const guestContext = await browser.newContext({ serviceWorkers: "block" });
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    try {
      await host.goto("/create");
      await host.locator("#create-name").fill("Casey");
      await host.locator("#create-game-name").fill("Host browser only");
      await host.locator("#create-buy-in").fill("20");
      await host.getByRole("button", { name: "Create game" }).click();
      const code = host.url().split("/").at(-1)!;

      await guest.goto("/join");
      await guest.locator("#join-name").fill("Jordan");
      await guest.locator("#join-code").fill(code);
      await expect(guest.getByText("Local-only tables are saved only in the host's browser.")).toBeVisible();
      await guest.getByRole("button", { name: "Continue to table details" }).click();
      await expect(guest.getByRole("alert")).toContainText("Game not found. Check the code and try again.");
      await expect(guest.locator("#join-name")).toHaveValue("Jordan");
      await expect(guest.locator("#join-code")).toHaveValue(code);
    } finally {
      await guestContext.close();
      await hostContext.close();
    }
  });

  test("requires a table preview before recording a pending opening buy-in", async ({ page }) => {
    await page.goto("/create");
    await page.locator("#create-name").fill("Casey");
    await page.locator("#create-game-name").fill("Preview required");
    await page.locator("#create-buy-in").fill("37");
    await page.getByRole("button", { name: "Create game" }).click();
    const code = page.url().split("/").at(-1)!;

    await page.evaluate(() => localStorage.setItem("ante_session_id", crypto.randomUUID()));
    await page.goto("/join");
    await page.locator("#join-name").fill("Jordan");
    await page.locator("#join-code").fill(code);
    await expect(page.getByText("Local-only tables are saved only in the host's browser.")).toBeVisible();
    await page.getByRole("button", { name: "Continue to table details" }).click();

    const preview = page.getByRole("region", { name: "Confirm table details" });
    await expect(preview).toContainText("Preview required");
    await expect(preview).toContainText("Casey");
    await expect(preview).toContainText("$37.00");
    await expect(preview).toContainText("pending host approval");
    await expect(page).toHaveURL(/\/join$/);

    await page.locator("#join-code").fill("DEF234");
    await expect(preview).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continue to table details" })).toBeVisible();

    await page.locator("#join-code").fill(code);
    await page.getByRole("button", { name: "Continue to table details" }).click();
    await page.getByRole("button", { name: "Join and record $37.00 buy-in" }).click();
    await expect(page).toHaveURL(new RegExp(`/game/${code}$`));
    const pending = page.getByRole("region", { name: "Needs approval" });
    await expect(pending).toContainText("Jordan");
    await expect(pending).toContainText("$37.00");
  });

  test("does not create payment-ready results until every amount is explicit", async ({ page }) => {
    await page.goto("/poker-settlement-calculator");
    await page.getByRole("button", { name: "Clear example" }).click();
    const results = page.locator("#calculator-results");

    await page.getByLabel("Money in for player 1", { exact: true }).fill("20");
    await page.getByLabel("Final stack for player 1", { exact: true }).fill("40");
    await page.getByLabel("Money in for player 2", { exact: true }).fill("20");
    await expect(results).toContainText("Enter money in and a final stack for every player.");
    await expect(results).not.toContainText("Bank balanced");
    await expect(results).not.toContainText("Payment list");

    await page.getByLabel("Final stack for player 2", { exact: true }).fill("0");
    await expect(results).toContainText("Bank balanced");
    await expect(results).toContainText("Player 2");
    await expect(results).toContainText("$20.00");
  });
});
