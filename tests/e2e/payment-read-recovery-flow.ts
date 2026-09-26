import { expect, test, type Browser, type Page } from "@playwright/test";
import { createDeviceContext } from "./device-context";

const paymentStatusRead = "**/rest/v1/settlement_payments*";

async function createGame(host: Page, name: string) {
  await host.goto("/create");
  await host.locator("#create-name").fill("Casey");
  await host.locator("#create-game-name").fill(name);
  await host.locator("#create-buy-in").fill("20");
  await host.getByRole("button", { name: "Create game", exact: true }).click();
  await expect(host.getByRole("heading", { name })).toBeVisible({ timeout: 15_000 });
}

async function joinGame(page: Page, gameUrl: string, name: string) {
  await page.goto(gameUrl);
  await page.locator("#join-prompt-name").fill(name);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.locator("#join-prompt-name")).toHaveCount(0, { timeout: 15_000 });
}

/**
 * Hosted regression helper for F01. The caller owns its enclosing realtime spec.
 * It leaves the status-read failure scoped to the payer browser and never issues
 * a payment mutation after the two initial recorded sends.
 */
export async function runPaymentReadRecoveryFlow(browser: Browser, baseURL: string) {
  const contexts = await Promise.all(
    [0, 1, 2].map(() => createDeviceContext(browser, { baseURL, reducedMotion: "reduce" })),
  );
  const [host, payer, recipient] = await Promise.all(contexts.map((context) => context.newPage()));
  try {
    await createGame(host, "Payment status recovery");
    await joinGame(payer, host.url(), "Jordan");
    await joinGame(recipient, host.url(), "Taylor");
    await host.getByRole("region", { name: "Needs approval" }).getByRole("button", { name: "Approve all" }).click();

    await host.getByRole("button", { name: "End game", exact: true }).click();
    await host.getByRole("button", { name: "Start cash-outs" }).click();
    for (const [name, amount] of [["Casey", "30"], ["Jordan", "0"], ["Taylor", "30"]] as const) {
      const input = host.getByRole("spinbutton", { name: `Cash-out amount for ${name}` });
      await input.fill(amount);
      await input.blur();
    }
    await expect(host.getByText("Bank reconciled", { exact: true })).toBeVisible();
    await host.getByRole("button", { name: "Review settlement", exact: true }).click();
    await host.getByRole("button", { name: "Lock settlement", exact: true }).click();
    await host.getByRole("alertdialog").getByRole("button", { name: "Lock settlement", exact: true }).click();

    const personal = payer.locator('section[aria-labelledby="your-settlement-heading"]');
    const ledger = payer.locator('[data-testid="payment-ledger"]');
    await expect(personal.getByRole("heading")).toHaveText("You owe $20.00.");
    await personal.getByTitle("Mark sent").first().click();
    await expect(personal.getByRole("heading")).toHaveText("You owe $10.00.");
    await personal.getByTitle("Mark sent").click();
    await expect(personal.getByRole("heading")).toHaveText("All your payments are marked sent.");
    await expect(ledger.locator(":scope > summary")).toContainText("2 of 2 payments marked sent");

    let writesAfterFailure = 0;
    payer.on("request", (request) => {
      if (request.url().includes("/rest/v1/rpc/set_settlement_payment_status_guarded")) writesAfterFailure += 1;
    });
    await payer.route(paymentStatusRead, (route) => route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ message: "Injected payment-status read failure" }),
    }));

    // A refresh failure after a confirmed response must keep the last record,
    // label it stale, and remove mutation controls.
    await payer.evaluate(() => window.dispatchEvent(new StorageEvent("storage")));
    await expect(personal.getByRole("heading")).toHaveText("Payment status needs refresh");
    await expect(personal).toContainText("Last recorded payment status");
    await expect(ledger.locator(":scope > summary")).toContainText("2 of 2 payments marked sent · status needs refresh");
    await expect(payer.getByTitle(/Mark sent|Reopen payment/)).toHaveCount(0);
    await payer.screenshot({ path: test.info().outputPath("payment-status-stale.png"), fullPage: true });

    // A reload has no in-memory last read. It must remain unknown, rather than
    // becoming a confidently unpaid $20 debt or a zero-sent ledger.
    await payer.reload();
    await expect(personal.getByRole("heading")).toHaveText("Payment status unavailable");
    await expect(personal).not.toContainText("You owe $20.00.");
    await expect(ledger.locator(":scope > summary")).not.toContainText("0 of 2 payments marked sent");
    await expect(ledger.locator(":scope > summary")).toContainText("Payment status unavailable");
    await expect(payer.getByTitle(/Mark sent|Reopen payment/)).toHaveCount(0);

    await payer.screenshot({ path: test.info().outputPath("payment-status-unavailable.png"), fullPage: true });
    await payer.unroute(paymentStatusRead);
    await personal.getByRole("button", { name: "Retry payment status" }).click();
    await expect(personal.getByRole("heading")).toHaveText("All your payments are marked sent.");
    await expect(ledger.locator(":scope > summary")).toContainText("2 of 2 payments marked sent");
    expect(writesAfterFailure).toBe(0);

    // Recipient-side refresh failures use the same neutral, non-actionable state.
    const recipientPersonal = recipient.locator('section[aria-labelledby="your-settlement-heading"]');
    await expect(recipientPersonal.getByRole("heading")).toHaveText("All payments to you are marked sent.");
    await recipient.route(paymentStatusRead, (route) => route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ message: "Injected recipient payment-status read failure" }),
    }));
    await recipient.evaluate(() => window.dispatchEvent(new StorageEvent("storage")));
    await expect(recipientPersonal.getByRole("heading")).toHaveText("Payment status needs refresh");
    await recipient.unroute(paymentStatusRead);
    await recipientPersonal.getByRole("button", { name: "Retry payment status" }).click();
    await expect(recipientPersonal.getByRole("heading")).toHaveText("All payments to you are marked sent.");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
}
