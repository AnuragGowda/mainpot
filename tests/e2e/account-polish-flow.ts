import { expect, test, type Browser } from "@playwright/test";
import { createDeviceContext } from "./device-context";

/**
 * Covers the hosted account polish path against the local Supabase stack.
 * Suite ownership stays with realtime.spec.ts so this remains reusable there.
 */
export async function runAccountPolishFlow(browser: Browser, baseURL: string) {
  const context = await createDeviceContext(browser, { baseURL });
  const page = await context.newPage();
  const suffix = crypto.randomUUID();
  const email = `account-polish-${suffix}@example.com`;
  const password = `AccountPolish-${suffix}`;
  const originalTemplateName = "Friday regulars";
  const updatedTemplateName = "Saturday regulars";

  try {
    await page.goto("/signin");
    await page.getByRole("button", { name: "Create an account", exact: true }).click();
    await page.getByLabel("Display name", { exact: true }).fill("Account Casey");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/create");
    await page.locator("#create-name").fill("Account Casey");
    await page.locator("#create-game-name").fill("Account polish game");
    await page.locator("#create-buy-in").fill("20");
    await page.getByRole("checkbox", { name: "Save these details as a recurring game" }).check();
    await page.getByLabel("Template name", { exact: true }).fill(originalTemplateName);
    await page.getByLabel("Preferred roster", { exact: true }).fill("Alex, Jordan");
    await page.getByRole("button", { name: "Create game", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Account polish game", exact: true })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "End game", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Start cash-outs", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cash-outs", exact: true })).toBeVisible();
    const cashOut = page.getByRole("spinbutton", { name: "Cash-out amount for Account Casey" });
    await cashOut.fill("20");
    await cashOut.blur();
    await expect(page.getByText("Bank reconciled", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Review settlement", exact: true }).click();
    await page.getByRole("button", { name: "Lock settlement", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Lock settlement", exact: true }).click();
    await expect(page.locator('[data-testid="payment-ledger"]')).toBeVisible({ timeout: 15_000 });

    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Account polish game", exact: true })).toBeVisible();
    const noTransfers = page.getByRole("link", { name: /No transfers required/ });
    await expect(noTransfers).toBeVisible();
    await page.screenshot({ path: `docs/audits/2026-09-26/evidence/account-payments-${test.info().project.name}.png`, fullPage: true });
    await noTransfers.click();
    await expect(page).toHaveURL(/#payment-ledger$/);
    await expect(page.locator('#payment-ledger[open]')).toBeVisible();

    await page.goto("/dashboard");
    await page.getByText("Account data and deletion", { exact: true }).click();
    await page.getByRole("button", { name: "Request account deletion", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Request deletion", exact: true }).click();
    await expect(page.getByText(/Your deletion request is/)).toContainText("pending");
    await page.getByRole("button", { name: "Cancel deletion request", exact: true }).click();
    await expect(page.getByText(/Your deletion request is/)).toContainText("cancelled");
    await page.getByRole("button", { name: "Request account deletion", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Request deletion", exact: true }).click();
    await expect(page.getByText(/Your deletion request is/)).toContainText("pending");
    await page.reload();
    await page.getByText("Account data and deletion", { exact: true }).click();
    await expect(page.getByText(/Your deletion request is/)).toContainText("pending");

    await page.goto("/create");
    await expect(page.locator("#create-template")).toBeVisible();
    await page.locator("#create-template").click();
    await page.getByRole("option", { name: originalTemplateName, exact: true }).click();
    await expect(page.getByText("Roster reminder", { exact: true })).toBeVisible();
    await expect(page.getByText("Alex, Jordan", { exact: true })).toBeVisible();

    await page.getByText("Manage saved templates", { exact: true }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Template name", { exact: true }).fill(updatedTemplateName);
    await page.getByLabel("Saved game name", { exact: true }).fill("Saturday account game");
    await page.getByLabel("Saved buy-in", { exact: true }).fill("25");
    await page.getByLabel("Roster reminder", { exact: true }).fill("Alex, Jordan, Sam");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `docs/audits/2026-09-26/evidence/template-edit-${test.info().project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: "Save template", exact: true }).click();
    await expect(page.getByText(updatedTemplateName, { exact: true }).last()).toBeVisible();

    await page.reload();
    await expect(page.locator("#create-template")).toBeVisible();
    await page.locator("#create-template").click();
    await page.getByRole("option", { name: updatedTemplateName, exact: true }).click();
    await expect(page.locator("#create-game-name")).toHaveValue("Saturday account game");
    await expect(page.locator("#create-buy-in")).toHaveValue("25");
    await expect(page.getByText("Alex, Jordan, Sam", { exact: true })).toBeVisible();

    await page.getByText("Manage saved templates", { exact: true }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove template", exact: true }).click();
    await expect(page.locator("#create-template")).toHaveCount(0);
    await page.reload();
    await expect(page.locator("#create-template")).toHaveCount(0);
  } finally {
    await context.close();
  }
}
