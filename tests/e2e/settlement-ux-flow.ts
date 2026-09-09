import { expect, type Page } from "@playwright/test";

/** Check the review decision and partial, complete, reopened payment states. */
export async function runSettlementUxFlow(page: Page) {
  await page.goto("/create");
  await page.getByRole("textbox", { name: "Your name" }).fill("Casey");
  await page.getByRole("textbox", { name: "Game name" }).fill("Settlement review test");
  await page.getByRole("textbox", { name: "Buy-in amount" }).fill("20");
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(page.getByRole("heading", { name: "Settlement review test" })).toBeVisible();
  for (const name of ["Jordan", "Taylor"]) {
    await page.getByRole("button", { name: "Add player", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add a player" });
    await dialog.getByRole("textbox", { name: "Player name" }).fill(name);
    await dialog.getByRole("button", { name: "Add player", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  await page.getByRole("button", { name: "End game", exact: true }).click();
  await page.getByRole("button", { name: "Start cash-outs" }).click();
  for (const [name, amount] of [["Casey", "0"], ["Jordan", "30"], ["Taylor", "30"]]) {
    const input = page.getByRole("spinbutton", { name: `Cash-out amount for ${name}` });
    await input.fill(amount);
    await input.blur();
  }
  await expect(page.getByText("Bank reconciled", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review settlement" }).click();
  const preview = page.getByRole("region", { name: "Review the payments" });
  await expect(preview).toContainText("Casey → Jordan");
  await expect(preview).toContainText("Casey → Taylor");
  await expect(preview.getByText("$10.00", { exact: true })).toHaveCount(2);
  await expect(preview.getByRole("checkbox")).toHaveCount(0);
  const lock = page.getByRole("button", { name: "Lock settlement", exact: true });
  expect(await preview.evaluate((element, button) => Boolean(
    element.compareDocumentPosition(button as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
  ), await lock.elementHandle())).toBe(true);
  await lock.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Lock settlement" }).click();

  const personal = page.locator('section[aria-labelledby="your-settlement-heading"]');
  const ledger = page.locator('[data-testid="payment-ledger"]');
  await ledger.locator(":scope > summary").click();
  await expect(personal.getByRole("heading")).toHaveText("You owe $20.00.");
  await personal.getByTitle("Mark sent").first().click();
  await expect(personal.getByRole("heading")).toHaveText("You owe $10.00.");
  await expect(ledger.locator(":scope > summary")).toContainText("1 of 2 payments marked sent");
  await expect(ledger.getByRole("checkbox").first()).toBeChecked();
  await personal.getByTitle("Mark sent").click();
  await expect(personal.getByRole("heading")).toHaveText("All your payments are marked sent.");
  await expect(personal).toContainText("Your net result: -$20.00");
  await expect(ledger.locator(":scope > summary")).toContainText("2 of 2 payments marked sent");
  await page.reload();
  await expect(personal.getByRole("heading")).toHaveText("All your payments are marked sent.");
  await personal.getByTitle("Reopen payment").first().click();
  await expect(personal.getByRole("heading")).toHaveText("You owe $10.00.");
  await expect(ledger.locator(":scope > summary")).toContainText("1 of 2 payments marked sent");
}
