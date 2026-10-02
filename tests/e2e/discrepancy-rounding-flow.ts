import { expect, test, type Page } from "@playwright/test";

/** Exercise cents allocation, locking, payment acknowledgement and reload. */
export async function runDiscrepancyRoundingFlow(page: Page, failFirstRefresh = false) {
  const names = ["Casey", "Avery", "Blake", "Drew", "Elliot"];
  await page.goto("/create");
  await page.getByRole("textbox", { name: "Your name" }).fill(names[0]);
  await page.getByRole("textbox", { name: "Game name" }).fill("Cents rounding test");
  await page.getByRole("textbox", { name: "Buy-in amount" }).fill("20");
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(page.getByRole("heading", { name: "Cents rounding test" })).toBeVisible();
  for (const name of names.slice(1)) {
    await page.getByRole("button", { name: "Add player", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add a player" });
    await dialog.getByRole("textbox", { name: "Player name" }).fill(name);
    await dialog.getByRole("button", { name: "Add player", exact: true }).click();
    // Match the application's guarded mutation deadline. Preserve evidence if
    // the dialog remains open; never resubmit a potentially committed seat.
    try {
      await expect(dialog).toHaveCount(0, { timeout: 15_000 });
    } catch (error) {
      await page.screenshot({ path: test.info().outputPath("rounding-add-player-failure.png"), fullPage: true });
      console.error("Rounding fixture add-player failed:", await dialog.getByRole("alert").allTextContents());
      throw error;
    }
  }
  await page.getByRole("button", { name: "End game", exact: true }).click();
  await page.getByRole("button", { name: "Start cash-outs" }).click();
  for (const [i, name] of names.entries()) {
    const input = page.getByRole("spinbutton", { name: `Cash-out amount for ${name}` });
    await input.fill(i === 4 ? "23.98" : "19");
    await input.blur();
  }
  await page.getByRole("button", { name: "Resolve $0.02 difference" }).click();
  const impact = page.getByRole("group", { name: "Discrepancy impact" });
  await expect(impact.getByRole("listitem")).toHaveCount(2);
  for (const name of names.slice(0, 2)) {
    await expect(impact.getByRole("listitem", {
      name: `${name}: -$1.00 before, +$0.01 adjustment, -$0.99 final`,
    })).toBeVisible();
  }
  if (failFirstRefresh) {
    let failedReads = 0;
    const readFailure = async (route: import("@playwright/test").Route) => {
      if (route.request().method() === "GET") {
        failedReads += 1;
        // Use a database read error: transient 5xx responses are retried by
        // the client and would test its backoff instead of our error path.
        await route.fulfill({ status: 400, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: '{"message":"Snapshot refresh unavailable"}' });
      } else {
        await route.continue();
      }
    };
    await page.route("**/rest/v1/**", readFailure);
    await page.getByRole("button", { name: "Review adjusted settlement" }).click();
    await expect(page.getByText("Could not refresh the game. Please retry.", { exact: true })).toBeVisible();
    expect(failedReads).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "Lock settlement", exact: true })).toHaveCount(0);
    await page.unroute("**/rest/v1/**", readFailure);
  }
  await page.getByRole("button", { name: "Review adjusted settlement" }).click();
  const preview = page.getByRole("region", { name: "Review the net settlement" });
  await expect(preview.getByText("$0.99", { exact: true })).toHaveCount(2);
  await expect(preview.getByText("$1.00", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Lock settlement", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Lock settlement" }).click();
  const ledger = page.locator('[data-testid="payment-ledger"]');
  await ledger.locator(":scope > summary").click();
  for (const [i, name] of names.slice(0, 4).entries()) {
    const checkbox = ledger.getByRole("checkbox", {
      name: `Mark sent: $${i < 2 ? "0.99" : "1.00"} from ${name} to Elliot`, exact: true,
    });
    await expect(checkbox).toBeEnabled();
    // Click the visible label, which owns the custom checkbox hit target.
    await checkbox.locator("..").click();
    await expect(checkbox).toBeChecked();
  }
  await expect(ledger.locator(":scope > summary")).toContainText("4 of 4 payments marked sent");
  await page.reload();
  await expect(ledger.locator(":scope > summary")).toContainText("4 of 4 payments marked sent");
  await ledger.locator(":scope > summary").click();
  await expect(ledger.getByRole("checkbox", { checked: true })).toHaveCount(4);
}
