import { expect, test } from "@playwright/test";

test.describe("public local-mode experience", () => {
  test("shows the landing page and validates an incomplete game form", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Keep the game friendly. Keep the money exact." })).toBeVisible();
    await page.getByRole("link", { name: "Start a game" }).first().click();

    await page.getByRole("button", { name: "Create game" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();
    await expect(page.getByText("Enter a game name.")).toBeVisible();
    await expect(page.getByText("Enter an amount greater than 0.")).toBeVisible();
  });

  test("runs a host from game creation through a balanced finalized settlement", async ({ page }) => {
    await page.goto("/create");
    await page.locator("#create-name").fill("Casey");
    await page.locator("#create-game-name").fill("Friday test game");
    await page.locator("#create-buy-in").fill("20");
    await page.getByRole("button", { name: "Create game" }).click();

    await expect(page).toHaveURL(/\/game\/[A-HJ-NP-Z2-9]{6}$/);
    await expect(page.getByRole("heading", { name: "Friday test game" })).toBeVisible();
    await expect(page.getByText("Saved on this device · live sync is off")).toBeVisible();

    await expect(page.getByText("Total pot", { exact: true }).locator("..").getByText("$20.00", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Buy in · $20.00" }).click();
    await expect(page.getByText("Buy-in added")).toBeVisible();
    await expect(page.getByText("Total pot", { exact: true }).locator("..").getByText("$40.00", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "End game" }).click();
    await page.getByRole("button", { name: "Confirm?" }).click();
    await expect(page.getByRole("heading", { name: "Cash-outs" })).toBeVisible();

    const cashOut = page.getByRole("spinbutton", { name: "Cash-out amount for Casey" });
    await cashOut.fill("40");
    await cashOut.blur();
    await expect(page.getByText("Bank reconciled", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Calculate settlement" }).click();
    await expect(page.getByRole("tab", { name: "Fewest payments" })).toHaveAttribute("aria-selected", "true");

    await page.getByRole("button", { name: "Finalize game" }).click();
    await page.getByRole("button", { name: "Finalize now?" }).click();
    await expect(page.getByText("Ended", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How did game night go?" })).toBeVisible();
  });
});
