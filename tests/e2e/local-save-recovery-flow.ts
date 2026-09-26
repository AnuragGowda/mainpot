import { expect, test, type Page } from "@playwright/test";

export async function runLocalSaveRecoveryFlow(page: Page) {
  await page.goto("/create");
  await page.locator("#create-name").fill("Casey");
  await page.locator("#create-game-name").fill("Storage recovery");
  await page.locator("#create-buy-in").fill("20");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  const table = page.getByRole("region", { name: "At the table" });
  await table.getByRole("button", { name: "Add player", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a player" });
  await dialog.getByRole("textbox", { name: "Player name" }).fill("casey");
  await dialog.getByRole("textbox", { name: "Opening buy-in" }).fill("7");
  await dialog.getByRole("button", { name: "Add player", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("already used at this table");
  await expect(table.getByRole("listitem")).toHaveCount(1);
  await dialog.getByRole("textbox", { name: "Player name" }).fill("Jordan");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Object.assign(window, { restoreLedgerWrite: () => { Storage.prototype.setItem = original; } });
    Storage.prototype.setItem = function(key, value) {
      if (key === "ante_store") throw new DOMException("Quota exceeded", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await dialog.getByRole("button", { name: "Add player", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("This change was not saved");
  await expect(table.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText("Pot", { exact: true }).locator("..")).toContainText("$20.00");
  await page.screenshot({ path: test.info().outputPath("storage-write-rejected.png"), fullPage: true });
  await page.evaluate(() => (window as unknown as { restoreLedgerWrite: () => void }).restoreLedgerWrite());
  await dialog.getByRole("button", { name: "Add player", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(table.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("Pot", { exact: true }).locator("..")).toContainText("$27.00");
  await page.reload();
  await expect(table.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("Pot", { exact: true }).locator("..")).toContainText("$27.00");
}
