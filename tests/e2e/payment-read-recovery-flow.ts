import { expect, test, type Browser, type Page } from "@playwright/test";
import { createDeviceContext } from "./device-context";
import { writeFile } from "node:fs/promises";
import { failureDiagnostics } from "./failure-diagnostics";

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
 * It injects status-read failures separately for payer and recipient, proves
 * failed reads disable mutations, and reconciles later server changes on resume.
 */
export async function runPaymentReadRecoveryFlow(browser: Browser, baseURL: string) {
  const contexts = await Promise.all(
    [0, 1, 2].map(() => createDeviceContext(browser, { baseURL, reducedMotion: "reduce" })),
  );
  const [host, payer, recipient] = await Promise.all(contexts.map((context) => context.newPage()));
  const failedReaders = new Set<Page>();
  const diagnostics = failureDiagnostics([host, payer, recipient]);
  await diagnostics.ready;
  const { runtimeErrors, setPhase, navigate, duringRoute } = diagnostics;

  const paymentReadFailure = async (route: import("@playwright/test").Route) => duringRoute(route.request().frame().page(), async () => {
    if (route.request().method() !== "GET" || !failedReaders.has(route.request().frame().page())) return route.continue();
    // The failure is synthetic. Avoid an independent upstream fetch that can
    // finish against the old WebKit document while a reload commits.
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      json: { message: "Injected payment-status read failure" },
    });
  });

  try {
    setPhase("create/join");
    await createGame(host, "Payment status recovery");
    await joinGame(payer, host.url(), "Jordan");
    await joinGame(recipient, host.url(), "Taylor");
    await host.getByRole("region", { name: "Needs approval" }).getByRole("button", { name: "Approve all" }).click();

    setPhase("finalize");
    await host.getByRole("button", { name: "End game", exact: true }).click();
    await host.getByRole("button", { name: "Start cash-outs" }).click();
    for (const [name, amount] of [["Casey", "30"], ["Jordan", "0"], ["Taylor", "30"]] as const) {
      const input = host.getByRole("spinbutton", { name: `Cash-out amount for ${name}` });
      await input.fill(amount);
      await input.blur();
    }
    await expect(host.getByText("Totals match", { exact: true })).toBeVisible();
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
    setPhase("payer failure/reload");
    failedReaders.add(payer);
    await payer.route(paymentStatusRead, paymentReadFailure);

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
    await navigate(payer, "payer reload", () => payer.reload());
    setPhase("payer recovery");
    await expect(personal.getByRole("heading")).toHaveText("Payment status unavailable");
    await expect(personal).not.toContainText("You owe $20.00.");
    await expect(ledger.locator(":scope > summary")).not.toContainText("0 of 2 payments marked sent");
    await expect(ledger.locator(":scope > summary")).toContainText("Payment status unavailable");
    await expect(payer.getByTitle(/Mark sent|Reopen payment/)).toHaveCount(0);

    await payer.screenshot({ path: test.info().outputPath("payment-status-unavailable.png"), fullPage: true });
    failedReaders.delete(payer);
    await personal.getByRole("button", { name: "Retry payment status" }).click();
    await expect(personal.getByRole("heading")).toHaveText("All your payments are marked sent.");
    await expect(ledger.locator(":scope > summary")).toContainText("2 of 2 payments marked sent");
    expect(writesAfterFailure).toBe(0);

    setPhase("recipient failure/resume");
    // Recipient-side refresh failures use the same neutral, non-actionable state.
    const recipientPersonal = recipient.locator('section[aria-labelledby="your-settlement-heading"]');
    await expect(recipientPersonal.getByRole("heading")).toHaveText("All payments to you are marked sent.");
    failedReaders.add(recipient);
    await recipient.route(paymentStatusRead, paymentReadFailure);
    await recipient.evaluate(() => window.dispatchEvent(new StorageEvent("storage")));
    await expect(recipientPersonal.getByRole("heading")).toHaveText("Payment status needs refresh");
    // The payer changes the authoritative state while the recipient cannot
    // read it. Recovery must not depend on another Realtime event or a click.
    await personal.getByRole("checkbox", { name: "Mark sent: $10.00 from Jordan to Taylor", exact: true }).locator("..").click();
    await expect(personal.getByRole("heading")).toHaveText("You owe $10.00.");
    await expect(recipientPersonal.getByRole("heading")).toHaveText("Payment status needs refresh");
    failedReaders.delete(recipient);
    await recipient.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(recipientPersonal.getByRole("heading")).toHaveText("$10.00 coming to you.");
    await personal.getByTitle("Mark sent").click();
    await expect(personal.getByRole("heading")).toHaveText("All your payments are marked sent.");
    failedReaders.add(recipient);

    await recipient.evaluate(() => window.dispatchEvent(new StorageEvent("storage")));
    await expect(recipientPersonal.getByRole("heading")).toHaveText("Payment status needs refresh");
    failedReaders.delete(recipient);
    await recipient.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(recipientPersonal.getByRole("heading")).toHaveText("All payments to you are marked sent.");

    // Keep this recipient foreground and online while forwarding its Realtime
    // subscription except for payment-table frames. Its next state must come
    // from the bounded authoritative HTTP reconciliation, not a browser event.
    setPhase("recipient reload/dropped frames");
    let droppedPaymentFrames = 0;
    let paymentChannelReady = false;
    await contexts[2].routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => {
      const server = socket.connectToServer();
      server.onMessage((message) => {
        let frame;
        try { frame = JSON.parse(String(message)); } catch { /* Forward non-JSON frames unchanged. */ }
        const event = Array.isArray(frame) ? frame[3] : frame?.event;
        const payload = Array.isArray(frame) ? frame[4] : frame?.payload;
        if (event === "phx_reply" && payload?.status === "ok" && payload.response?.postgres_changes?.some((binding: { table?: string }) => binding.table === "settlement_payments")) paymentChannelReady = true;
        if (event === "postgres_changes" && payload?.data?.table === "settlement_payments") {
          droppedPaymentFrames += 1;
          return;
        }
        socket.send(message);
      });
    });
    await navigate(recipient, "recipient reload", () => recipient.reload());
    setPhase("recipient dropped-frame reconciliation");
    await expect(recipientPersonal.getByRole("heading")).toHaveText("All payments to you are marked sent.");
    await expect.poll(() => paymentChannelReady, { timeout: 15_000 }).toBe(true);
    await personal.getByRole("checkbox", { name: "Mark sent: $10.00 from Jordan to Taylor", exact: true }).locator("..").click();
    await expect.poll(() => droppedPaymentFrames, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(recipientPersonal.getByRole("heading")).toHaveText("$10.00 coming to you.", { timeout: 12_000 });
    if (runtimeErrors.length || diagnostics.report().retiredReads.length) await writeFile(test.info().outputPath("network-diagnostics.json"), JSON.stringify(diagnostics.report(), null, 2));
    expect(diagnostics.unhandledErrors(), "Independent devices must not leave uncaught browser errors").toEqual([]);
  } catch (error) {
    // Preserve the original assertion if browser teardown also fails.
    console.error("Payment-read recovery failed before teardown:", error);
    const report = JSON.stringify(diagnostics.report(), null, 2);
    console.error("WebKit failure diagnostics:", report);
    try { await writeFile(test.info().outputPath("network-diagnostics.json"), report); } catch { /* Preserve the original failure. */ }
    throw error;
  } finally {
    await Promise.all([payer, recipient].map(page => page.unrouteAll({ behavior: "ignoreErrors" })));
    await Promise.all(contexts.map(async (context, index) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          context.close(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Payment-read context ${index} did not close within 10 seconds.`)), 10_000);
          }),
        ]);
      } finally { if (timer) clearTimeout(timer); }
    }));
  }
}
