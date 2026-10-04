import { expect, type Page } from "@playwright/test";

/** The same real UI journey runs with local storage and the disposable database. */
export async function runHostPlayerFlow(page: Page) {
  await page.goto("/create");
  await page.locator("#create-name").fill("Casey");
  await page.locator("#create-game-name").fill("Host-managed table");
  await page.locator("#create-buy-in").fill("20");
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(page.getByRole("heading", { name: "Host-managed table" })).toBeVisible();
  const hostSession = await page.evaluate(() => localStorage.getItem("ante_session_id"));
  const table = page.getByRole("region", { name: "At the table" });
  const jordan = table.getByRole("listitem").filter({ hasText: "Jordan" });
  const taylor = table.getByRole("listitem").filter({ hasText: "Taylor" });

  for (const [name, amount] of [["Jordan", "20"], ["Taylor", "0"]]) {
    await table.getByRole("button", { name: "Add player", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add a player" });
    await expect(dialog.getByRole("textbox", { name: "Player name" })).toBeFocused();
    await dialog.getByRole("textbox", { name: "Player name" }).fill(name);
    await dialog.getByRole("textbox", { name: "Opening buy-in" }).fill(amount);
    await dialog.getByRole("button", { name: "Add player", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(table.getByRole("listitem").filter({ hasText: name })).toContainText("Host-managed");
  }
  await expect(jordan).toContainText("$20.00");
  await expect(taylor).toContainText("0 entries");
  expect(await page.evaluate(() => localStorage.getItem("ante_session_id"))).toBe(hostSession);
  await expect(page.getByRole("button", { name: "Leave", exact: true })).toBeDisabled();

  await jordan.getByRole("button", { name: "Manage Jordan" }).click();
  const jordanForm = page.getByRole("dialog", { name: "Manage Jordan" });
  const jordanAmount = jordanForm.getByRole("textbox", { name: "Buy-in amount" });
  await jordanAmount.fill("5.50");
  await expect(jordanAmount).toHaveValue("5.50");
  await jordanForm.getByRole("button", { name: "Record buy-in" }).click();
  await expect(jordanForm).toHaveCount(0);
  await expect(jordan).toContainText("$25.50");
  await expect(jordan).toContainText("2 entries");
  await expect(page.getByRole("region", { name: "Needs approval" })).toHaveCount(0);

  await taylor.getByRole("button", { name: "Manage Taylor" }).click();
  const taylorForm = page.getByRole("dialog", { name: "Manage Taylor" });
  await taylorForm.getByRole("textbox", { name: "Buy-in amount" }).fill("10");
  await taylorForm.getByRole("button", { name: "Record buy-in" }).click();
  await expect(taylorForm).toHaveCount(0);
  await expect(taylor).toContainText("$10.00");
  await page.reload();
  await expect(table.getByRole("listitem")).toHaveCount(3);
  await expect(jordan).toContainText("$25.50");

  // The host can cash out a phone-free player while the other seats stay active.
  await taylor.getByRole("button", { name: "Manage Taylor" }).click();
  await taylorForm.getByRole("button", { name: "Cash-out", exact: true }).click();
  await taylorForm.getByRole("textbox", { name: "Final stack" }).fill("5");
  await taylorForm.getByRole("button", { name: "Review cash-out" }).click();
  await expect(taylorForm).toHaveCount(0);
  const early = page.getByRole("region", { name: "Early cash-outs" });
  await expect(early).toContainText("Taylor");
  await early.getByRole("button", { name: "Confirm & lock" }).click();
  await expect(taylor).toContainText("Cashed out");
  await expect(taylor.getByRole("button", { name: "Manage Taylor" })).toHaveCount(0);

  await page.getByRole("button", { name: "End game", exact: true }).click();
  await page.getByRole("button", { name: "Start cash-outs" }).click();
  await page.getByRole("spinbutton", { name: "Cash-out amount for Casey" }).fill("30");
  await page.getByRole("spinbutton", { name: "Cash-out amount for Casey" }).blur();
  await page.getByRole("spinbutton", { name: "Cash-out amount for Jordan" }).fill("20.50");
  await page.getByRole("spinbutton", { name: "Cash-out amount for Jordan" }).blur();
  await expect(page.getByText("Totals match", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review settlement" }).click();
  await page.getByRole("button", { name: "Lock settlement", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Lock settlement", exact: true }).click();
  await expect(page.getByText("Ended", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Customize and share your game card" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add player", exact: true })).toHaveCount(0);
}
