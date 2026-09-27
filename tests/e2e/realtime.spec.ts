import { runSeatContinuityFlow } from "./seat-continuity-flow";
import { runLobbyNameGuardFlow } from "./lobby-name-guard-flow";
import { runPaymentReadRecoveryFlow } from "./payment-read-recovery-flow";
import { runAccountPolishFlow } from "./account-polish-flow";
import { runExpiredGuestRecoveryWindowFlow, runGuestAccountTransfer } from "./account-transfer-flow";
import { runBankPlanFlow } from "./bank-flow";
import { checkAccountRecovery, checkSavedFriendInvitation } from "./audit-fixes-flow";
import { runHostPlayerFlow } from "./host-player-flow";
import { runSettlementUxFlow } from "./settlement-ux-flow";
import { expect, test, type Route } from "@playwright/test";
import { createDeviceContext } from "./device-context";

// Local guest creation is deliberately rate-limited, so these database-backed
// scenarios run one at a time while each scenario still uses separate users.
test.describe.configure({ mode: "default" });

test("keeps account templates, payment history, and deletion cancellation recoverable", async ({ browser, baseURL }) => {
  test.slow();
  await runAccountPolishFlow(browser, baseURL!);
});

test("reviews payments before locking and keeps completion in sync", async ({ page }) => {
  test.slow();
  await runSettlementUxFlow(page);
});

async function createGame(host: import("@playwright/test").Page, name: string) {
  await host.goto("/create");
  await host.locator("#create-name").fill("Casey");
  await host.locator("#create-game-name").fill(name);
  await host.locator("#create-buy-in").fill("20");
  await host.getByRole("button", { name: "Create game" }).click();
  await expect(host).toHaveURL(/\/game\/[A-HJ-NP-Z2-9]{6}$/, { timeout: 15_000 });
}

async function joinGame(page: import("@playwright/test").Page, gameUrl: string, name: string) {
  await page.goto(gameUrl);
  await expect(page.getByRole("dialog", { name: "Realtime test game" })).toBeVisible({ timeout: 15_000 });
  await page.locator("#join-prompt-name").fill(name);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Realtime test game" })).toHaveCount(0, { timeout: 15_000 });
  await expect(playerCard(page, name)).toBeVisible({ timeout: 15_000 });
}

async function expectAutomaticOpeningBuyIn(page: import("@playwright/test").Page) {
  await expect(page.getByRole("button", { name: "Buy in · $20.00" })).toHaveCount(0);
}

test("requires visitors to join before viewing an active game", async ({ browser }) => {
  const hostContext = await createDeviceContext(browser);
  const guestContext = await createDeviceContext(browser);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await createGame(host, "Realtime test game");
    await guest.goto(host.url());

    const dialog = guest.getByRole("dialog", { name: "Realtime test game" });
    await expect(dialog).toContainText("Casey");
    await expect(dialog).toContainText("$20.00");
    await expect(
      guest.getByRole("button", { name: "View the room without joining" }),
    ).toHaveCount(0);

    await guest.keyboard.press("Escape");
    await expect(guest).toHaveURL(/\/join$/);
    await expect(guest.getByRole("form", { name: "Join a game" })).toBeVisible();
    await expect(guest.locator("#join-name")).toBeEnabled();
    // Wait for WebKit to finish the client-side Escape navigation before
    // starting a second navigation to the invite.
    await guest.waitForLoadState("networkidle");
    await expect(guest.getByRole("region", { name: "At the table" })).toHaveCount(0);
    await guest.goto(host.url());
    await expect(dialog).toBeVisible();

    await guest.locator("#join-prompt-name").fill("Jordan");
    await guest.getByRole("button", { name: "Join", exact: true }).click();
    await expect(
      guest.getByRole("heading", { name: "Realtime test game" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(playerCard(guest, "Jordan")).toBeVisible();
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});

function playerCard(page: import("@playwright/test").Page, name: string) {
  return page
    .getByRole("region", { name: "At the table" })
    .getByRole("listitem")
    .filter({ hasText: name });
}

test("syncs two guests' independent ledger entries and host approval", async ({ browser }) => {
  const hostContext = await createDeviceContext(browser);
  const jordanContext = await createDeviceContext(browser);
  const taylorContext = await createDeviceContext(browser);
  const host = await hostContext.newPage();
  const jordan = await jordanContext.newPage();
  const taylor = await taylorContext.newPage();

  try {
    await createGame(host, "Realtime test game");

    await joinGame(jordan, host.url(), "Jordan");
    await joinGame(taylor, host.url(), "Taylor");
    await expect(playerCard(host, "Jordan")).toBeVisible();
    await expect(playerCard(host, "Taylor")).toBeVisible();

    await expectAutomaticOpeningBuyIn(jordan);
    await expectAutomaticOpeningBuyIn(taylor);
    const pending = host.getByRole("region", { name: "Needs approval" });
    await expect(pending.getByRole("listitem")).toHaveCount(2);

    await expect(pending.getByRole("button", { name: "Approve all", exact: true })).toBeVisible();
    await pending.getByRole("button", { name: "Approve all", exact: true }).click();
    await expect(host.getByRole("region", { name: "Needs approval" })).toHaveCount(0);
    await expect(playerCard(host, "Jordan").getByText("1 entry", { exact: true })).toBeVisible();
    await expect(playerCard(host, "Taylor").getByText("1 entry", { exact: true })).toBeVisible();
  } finally {
    await taylorContext.close();
    await jordanContext.close();
    await hostContext.close();
  }
});

test("locks an early cash-out against the host and carries it out of final settlement", async ({ browser }) => {
  test.slow();
  const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
  const hostContext = await createDeviceContext(browser, mobile);
  const guestContext = await createDeviceContext(browser, mobile);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await createGame(host, "Realtime test game");
    await joinGame(guest, host.url(), "Jordan");
    await expectAutomaticOpeningBuyIn(guest);
    await host.getByRole("button", { name: "Approve", exact: true }).click();

    await guest.getByRole("button", { name: "Cash out", exact: true }).click();
    const requestDialog = guest.getByRole("alertdialog", { name: "Cash out & leave" });
    await requestDialog.getByRole("textbox", { name: "Final chips for early cash-out" }).fill("30");
    await expect(requestDialog.getByRole("textbox", { name: "Final chips for early cash-out" })).toHaveValue("30");
    await expect(requestDialog).toContainText("+$10.00");
    await expect(requestDialog).toContainText("Casey will pay you $10.00.");
    await requestDialog.getByRole("button", { name: "Send to host" }).click();

    const hostEarlyCashOuts = host.getByRole("region", { name: "Early cash-outs" });
    await expect(hostEarlyCashOuts).toContainText("Jordan", { timeout: 15_000 });
    await expect(hostEarlyCashOuts).toContainText("host review");
    await hostEarlyCashOuts.getByRole("button", { name: "Confirm & lock" }).click();

    await expect(guest.getByText("You cashed out early. Your payment record is above.", { exact: true })).toBeVisible({ timeout: 15_000 });
    const guestEarlyCashOuts = guest.getByRole("region", { name: "Early cash-outs" });
    await expect(guestEarlyCashOuts).toContainText("Casey → Jordan");
    await expect(guestEarlyCashOuts).toContainText("$10.00");
    await guestEarlyCashOuts.getByTitle("Mark sent").click();
    await expect(guest.getByText("Payment marked sent", { exact: true })).toBeVisible();
    await guestEarlyCashOuts.getByTitle("Reopen payment").click();
    await expect(guestEarlyCashOuts.getByTitle("Mark sent")).toBeVisible();

    await host.getByRole("button", { name: "End game" }).click();
    await host.getByRole("button", { name: "Start cash-outs" }).click();
    await expect(host.getByRole("heading", { name: "Cash-outs", exact: true })).toBeVisible();
    const lockedJordan = host.getByText("Jordan", { exact: true }).locator("../..");
    await expect(lockedJordan).toContainText("cashed out early");
    await expect(host.getByRole("spinbutton", { name: "Cash-out amount for Jordan" })).toBeDisabled();

    const hostCashOut = host.getByRole("spinbutton", { name: "Cash-out amount for Casey" });
    await hostCashOut.fill("10");
    await hostCashOut.blur();
    await expect(host.getByText("Bank reconciled", { exact: true })).toBeVisible();
    await host.getByRole("button", { name: "Review settlement" }).click();
    const fullPlan = host.locator('[data-testid="full-settlement-plan"]');
    await expect(fullPlan.getByRole("region", { name: "Early cash-outs" })).toBeHidden();
    await fullPlan.locator(":scope > summary").click();
    await expect(fullPlan.getByRole("region", { name: "Early cash-outs" })).toBeVisible();
    await expect(fullPlan).toContainText("Casey → Jordan");
    await expect(fullPlan.getByText("No transfers needed — everyone is square.").first()).toBeVisible();

    await host.getByRole("button", { name: "Lock settlement", exact: true }).click();
    await host.getByRole("alertdialog").getByRole("button", { name: "Lock settlement", exact: true }).click();

    const paymentLedger = host.locator('[data-testid="payment-ledger"]');
    await expect(paymentLedger.locator(":scope > summary")).toContainText("0 of 1 payment marked sent · includes early cash-outs");
    const personal = host.locator('section[aria-labelledby="your-settlement-heading"]');
    await expect(personal.getByRole("heading")).toHaveText("You owe $10.00.");
    await expect(personal).toContainText("Your net result: $0.00");
    await personal.getByTitle("Mark sent").click();
    await expect(personal.getByRole("heading")).toHaveText("All your payments are marked sent.");
    await expect(paymentLedger.locator(":scope > summary")).toContainText("1 of 1 payment marked sent · includes early cash-outs");
    await expect(paymentLedger.getByRole("region", { name: "Early cash-outs" })).toBeHidden();
    await paymentLedger.locator(":scope > summary").click();
    await expect(paymentLedger.getByRole("region", { name: "Early cash-outs" })).toBeVisible();
    await expect(paymentLedger).toContainText("Casey → Jordan");
    await expect(paymentLedger.getByRole("heading", { name: "Final settlement", exact: true })).toBeVisible();
  } finally {
    await guestContext.close().catch(() => undefined);
    await hostContext.close().catch(() => undefined);
  }
});

for (const failRealtime of [false, true]) {
  test(`keeps two early cash-outs usable through refresh and settlement${failRealtime ? " when realtime setup fails" : ""}`, async ({ browser }, testInfo) => {
    test.slow();
    const contexts = await Promise.all([createDeviceContext(browser), createDeviceContext(browser), createDeviceContext(browser)]);
    const [hostContext, jordanContext, taylorContext] = contexts;
    if (failRealtime) {
      await hostContext.addInitScript(() => {
        const NativeWebSocket = window.WebSocket;
        window.WebSocket = class extends NativeWebSocket {
          constructor(url: string | URL, protocols?: string | string[]) {
            if (String(url).includes("/realtime/v1/websocket")) throw new Error("Injected realtime setup failure");
            super(url, protocols);
          }
        };
      });
    }
    const [host, jordan, taylor] = await Promise.all(contexts.map(context => context.newPage()));
    const errors: string[] = [];
    let hostReloading = false;
    for (const page of [host, jordan, taylor]) {
      page.on("pageerror", error => {
        // WebKit reports an aborted auth fetch when the old document is
        // replaced. Still require the refreshed authenticated room below.
        if (page === host && hostReloading && /auth\/v1\/user due to access control checks\.$/.test(error.message)) return;
        errors.push(error.message);
      });
      page.on("console", message => {
        // React catches effect failures and reports them to console instead
        // of pageerror; those must also fail this regression test.
        if (message.type() === "error" && /^(?:Error|TypeError|ReferenceError):|Minified React error|callbacks for realtime:/.test(message.text())) errors.push(message.text());
      });
    }
    try {
      await createGame(host, "Realtime test game");
      const gameUrl = host.url();
      await joinGame(jordan, gameUrl, "Jordan");
      await joinGame(taylor, gameUrl, "Taylor");
      await host.getByRole("region", { name: "Needs approval" }).getByRole("button", { name: "Approve all", exact: true }).click();
      await expect(host.getByRole("region", { name: "Needs approval" })).toHaveCount(0);
      const hostEarly = host.getByRole("region", { name: "Early cash-outs" });
      for (const [guest, name, amount] of [[jordan, "Jordan", "30"], [taylor, "Taylor", "5"]] as const) {
        await guest.getByRole("button", { name: "Cash out", exact: true }).click();
        const dialog = guest.getByRole("alertdialog", { name: "Cash out & leave" });
        await dialog.getByRole("textbox", { name: "Final chips for early cash-out" }).fill(amount);
        await dialog.getByRole("button", { name: "Send to host" }).click();
        await hostEarly.getByRole("article", { name, exact: true }).getByRole("button", { name: "Confirm & lock" }).click();
        await expect(guest.getByText("You cashed out early. Your payment record is above.", { exact: true })).toBeVisible();
        await expect(hostEarly.getByRole("button", { name: "Confirm & lock" })).toHaveCount(0);
      }
      await expect(hostEarly.getByTitle("Mark sent")).toHaveCount(2);
      await expect(host.getByRole("heading", { name: "Mainpot hit a snag" })).toHaveCount(0);
      hostReloading = true;
      await host.reload();
      await expect(hostEarly.getByTitle("Mark sent")).toHaveCount(2);
      hostReloading = false;
      await hostEarly.getByTitle("Mark sent").first().click();
      await expect(jordan.getByRole("region", { name: "Early cash-outs" }).getByTitle("Reopen payment")).toHaveCount(1);
      hostReloading = true;
      await host.reload();
      await expect(hostEarly.getByTitle("Reopen payment")).toHaveCount(1);
      await expect(hostEarly.getByTitle("Mark sent")).toHaveCount(1);
      hostReloading = false;
      await host.screenshot({ path: testInfo.outputPath("two-early-cash-outs.png"), fullPage: true });

      await host.getByRole("button", { name: "End game" }).click();
      await host.getByRole("button", { name: "Start cash-outs" }).click();
      const hostCashOut = host.getByRole("spinbutton", { name: "Cash-out amount for Casey" });
      await hostCashOut.fill("25");
      await hostCashOut.blur();
      await expect(host.getByText("Bank reconciled", { exact: true })).toBeVisible();
      await host.getByRole("button", { name: "Review settlement" }).click();
      await host.getByRole("button", { name: "Lock settlement", exact: true }).click();
      await host.getByRole("alertdialog").getByRole("button", { name: "Lock settlement", exact: true }).click();
      await expect(host.locator('[data-testid="payment-ledger"] > summary')).toContainText("1 of 2 payments marked sent");
      hostReloading = true;
      await host.reload();
      await expect(host.locator('[data-testid="payment-ledger"] > summary')).toContainText("1 of 2 payments marked sent");
      hostReloading = false;
      expect(errors, "All three clients must remain free of room and payment effect crashes").toEqual([]);
    } finally {
      await Promise.all(contexts.map(context => context.close()));
    }
  });
}

test("auto-approves host rebuys while keeping player entries pending", async ({ browser }) => {
  const hostContext = await createDeviceContext(browser);
  const guestContext = await createDeviceContext(browser);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await createGame(host, "Realtime test game");

    await host.getByRole("button", { name: "Add a rebuy" }).click();
    await host.getByRole("spinbutton", { name: "Rebuy amount" }).fill("15");
    await host.getByRole("button", { name: "Add rebuy" }).click();

    await expect(host.getByText("Rebuy added", { exact: true })).toBeVisible();
    await expect(host.getByRole("region", { name: "Needs approval" })).toHaveCount(0);
    await expect(playerCard(host, "Casey").getByText("2 entries", { exact: true })).toBeVisible();
    await expect(playerCard(host, "Casey")).toContainText("$35.00");

    await joinGame(guest, host.url(), "Jordan");
    await expectAutomaticOpeningBuyIn(guest);

    const pending = host.getByRole("region", { name: "Needs approval" });
    await expect(pending.getByRole("listitem")).toHaveCount(1);
    await expect(pending.getByRole("listitem")).toContainText("Jordan");
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});

test("records one pending opening buy-in when a guest joins and does not duplicate it on reload", async ({ browser }) => {
  const hostContext = await createDeviceContext(browser);
  const guestContext = await createDeviceContext(browser);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await createGame(host, "Realtime test game");
    await joinGame(guest, host.url(), "Jordan");
    await expectAutomaticOpeningBuyIn(guest);

    const pending = host.getByRole("region", { name: "Needs approval" });
    await expect(pending.getByRole("listitem")).toHaveCount(1);
    await expect(pending.getByRole("listitem")).toContainText("Jordan");
    await expect(pending.getByRole("listitem")).toContainText("$20.00");

    await guest.reload();
    await expect(guest.getByRole("heading", { name: "Realtime test game" })).toBeVisible({ timeout: 15_000 });
    await expectAutomaticOpeningBuyIn(guest);
    await expect(pending.getByRole("listitem")).toHaveCount(1);

    await pending.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(host.getByRole("region", { name: "Needs approval" })).toHaveCount(0);
    await expect(playerCard(host, "Jordan").getByText("1 entry", { exact: true })).toBeVisible();
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});

test("records a player's rebuy in the shared ledger", async ({ browser }) => {
  const hostContext = await createDeviceContext(browser);
  const guestContext = await createDeviceContext(browser);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await createGame(host, "Realtime test game");
    await joinGame(guest, host.url(), "Jordan");

    await expectAutomaticOpeningBuyIn(guest);
    await host.getByRole("button", { name: "Approve", exact: true }).click();
    await guest.getByRole("button", { name: "Add a rebuy" }).click();
    const rebuyDialog = guest.getByRole("dialog", { name: "Add a rebuy" });
    await rebuyDialog.getByRole("spinbutton", { name: "Rebuy amount" }).fill("15");
    await rebuyDialog.getByText("Payment details", { exact: false }).click();
    await rebuyDialog.getByRole("checkbox", { name: "Someone else paid and I still owe them" }).check();
    await rebuyDialog.getByRole("combobox", { name: "Who advanced your rebuy?" }).click();
    await guest.getByRole("option", { name: "Casey" }).click();
    await rebuyDialog.getByRole("button", { name: "Add rebuy" }).click();

    await expect(
      guest.getByText("Rebuy and outstanding advance added", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const pending = host.getByRole("region", { name: "Needs approval" });
    await expect(pending.getByRole("listitem")).toHaveCount(1);
    await expect(pending.getByRole("listitem")).toContainText("Rebuy");
    await expect(pending.getByRole("listitem")).toContainText("$15.00");
    await expect(pending.getByRole("listitem")).toContainText("Outstanding advance owed to Casey");
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});

test("transfers host authority when the host leaves", async ({ browser }) => {
  const hostContext = await createDeviceContext(browser);
  const jordanContext = await createDeviceContext(browser);
  const host = await hostContext.newPage();
  const jordan = await jordanContext.newPage();

  try {
    await createGame(host, "Realtime test game");
    await joinGame(jordan, host.url(), "Jordan");

    await expect(host.getByRole("button", { name: "End game" })).toBeVisible();
    await expect(host.getByText("Host controls", { exact: true })).toHaveCount(0);
    await host.getByRole("button", { name: "Leave" }).click();
    await expect(host.getByRole("heading", { name: "Choose the next host" })).toBeVisible();
    await host.getByRole("combobox", { name: "New host" }).click();
    await host.getByRole("option", { name: "Jordan" }).click();
    await host.getByRole("button", { name: "Transfer & leave" }).click();

    await expect(host.getByRole("button", { name: "End game" })).toHaveCount(0);
    await expect(host.getByText("You left this game. Ask Jordan to return your existing seat to the table.", { exact: true })).toBeVisible();
    await expect(jordan.getByRole("button", { name: "End game" })).toBeVisible();
    await expect(
      jordan.getByText(
        "You're the host now — you can manage the ledger and end the game.",
      ),
    ).toBeVisible();
    await expect(jordan.getByText("Host controls", { exact: true })).toHaveCount(0);
    await expect(playerCard(jordan, "Jordan").getByText("Host", { exact: true })).toBeVisible();
    await expect(playerCard(jordan, "Casey").getByText("Host", { exact: true })).toHaveCount(0);
  } finally {
    await jordanContext.close();
    await hostContext.close();
  }
});

test("recovers a disconnected guest after the host starts settlement", async ({ browser }) => {
  const hostContext = await createDeviceContext(browser);
  const jordanContext = await createDeviceContext(browser);
  const host = await hostContext.newPage();
  const jordan = await jordanContext.newPage();

  try {
    await createGame(host, "Realtime test game");
    await joinGame(jordan, host.url(), "Jordan");
    await expectAutomaticOpeningBuyIn(jordan);
    await host.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(host.getByRole("region", { name: "Needs approval" })).toHaveCount(0);

    await jordanContext.setOffline(true);
    // Chromium's network emulation does not consistently dispatch the browser
    // connectivity event, so exercise the same event the device emits.
    await jordan.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(
      jordan.getByText(/You’re offline|Live updates paused/),
    ).toBeVisible();
    await host.getByRole("button", { name: "End game" }).click();
    await host.getByRole("button", { name: "Start cash-outs" }).click();
    await expect(host.getByRole("heading", { name: "Cash-outs", exact: true })).toBeVisible();

    await jordanContext.setOffline(false);
    await jordan.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(jordan.getByRole("heading", { name: "Cash-outs", exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(
      jordan.getByText(/You’re offline|Live updates paused/),
    ).toHaveCount(0);
  } finally {
    await jordanContext.close();
    await hostContext.close();
  }
});

test("keeps host correction and approval decisions auditable", async ({ browser }) => {
  const hostContext = await createDeviceContext(browser);
  const jordanContext = await createDeviceContext(browser);
  const taylorContext = await createDeviceContext(browser);
  const host = await hostContext.newPage();
  const jordan = await jordanContext.newPage();
  const taylor = await taylorContext.newPage();

  try {
    await createGame(host, "Realtime test game");
    await joinGame(jordan, host.url(), "Jordan");
    await joinGame(taylor, host.url(), "Taylor");

    await expectAutomaticOpeningBuyIn(jordan);
    await expectAutomaticOpeningBuyIn(taylor);
    const pending = host.getByRole("region", { name: "Needs approval" });
    await expect(pending.getByRole("listitem")).toHaveCount(2);

    const jordanPending = pending.getByRole("listitem").filter({ hasText: "Jordan" });
    const taylorPending = pending.getByRole("listitem").filter({ hasText: "Taylor" });
    await jordanPending.getByRole("button", { name: /Edit Jordan buy-in/ }).click();
    await jordanPending.getByLabel("Correct amount").fill("25");

    await jordanPending.getByRole("button", { name: "Save" }).click();
    await expect(host.getByText("Buy-in updated", { exact: true })).toBeVisible();
    await taylorPending.getByRole("button", { name: "Approve", exact: true }).click();

    await expect(host.getByRole("region", { name: "Needs approval" })).toHaveCount(0);
    await expect(playerCard(host, "Taylor").getByText("1 entry", { exact: true })).toBeVisible();
    await expect(playerCard(host, "Jordan")).toContainText("$25.00");
    await expect(host.getByText("edited Jordan’s buy-in", { exact: false })).toBeVisible();
  } finally {
    await taylorContext.close();
    await jordanContext.close();
    await hostContext.close();
  }
});

test("releases a stalled host correction and keeps the amount ready to retry", async ({ browser }) => {
  test.slow();
  const hostContext = await createDeviceContext(browser);
  const guestContext = await createDeviceContext(browser);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await createGame(host, "Realtime test game");
    await joinGame(guest, host.url(), "Jordan");
    const pending = host.getByRole("region", { name: "Needs approval" });
    const jordanPending = pending.getByRole("listitem").filter({ hasText: "Jordan" });
    await expect(jordanPending).toBeVisible();
    const stalledCorrection = async (route: Route) => {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      await route.abort();
    };
    await host.route("**/rest/v1/rpc/correct_buy_in_as_host", stalledCorrection);
    await jordanPending.getByRole("button", { name: /Edit Jordan buy-in/ }).click();
    const amount = jordanPending.getByLabel("Correct amount");
    await amount.fill("25");
    await jordanPending.getByRole("button", { name: "Save" }).click();
    await expect(jordanPending.getByRole("button", { name: "Save" })).toBeDisabled();
    await expect(jordanPending.getByRole("alert")).toContainText("couldn't confirm whether the correction was saved", { timeout: 18_000 });
    await expect(amount).toHaveValue("25");
    await expect(jordanPending.getByRole("button", { name: "Save" })).toBeEnabled();
    await amount.fill("26");
    await host.unroute("**/rest/v1/rpc/correct_buy_in_as_host", stalledCorrection);
    await jordanPending.getByRole("button", { name: "Save" }).click();
    await expect(host.getByRole("region", { name: "Needs approval" })).toHaveCount(0, { timeout: 15_000 });
    await expect(playerCard(host, "Jordan").getByText("1 entry", { exact: true })).toBeVisible();
    await expect(playerCard(host, "Jordan")).toContainText("$26.00");
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});

test("keeps a zero cash-out draft through a delayed failure and retries it", async ({ browser }) => {
  const hostContext = await createDeviceContext(browser);
  const host = await hostContext.newPage();
  let releaseSave: (() => void) | undefined;
  const saveReleased = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });

  const stallFirstCashOutSave = async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const response = await route.fetch({ url: route.request().url().replace("rpc/save_cash_out", "cash_outs?select=id&limit=0"), method: "GET", postData: undefined });
    await saveReleased;
    await route.fulfill({ response, status: 400, json: { message: "Injected delayed cash-out response failure" } });
  };

  try {
    await createGame(host, "Realtime test game");
    await host.getByRole("button", { name: "End game" }).click();
    await host.getByRole("button", { name: "Start cash-outs" }).click();

    await host.route("**/rest/v1/rpc/save_cash_out", stallFirstCashOutSave);
    const cashOut = host.getByRole("spinbutton", { name: "Cash-out amount for Casey" });
    await cashOut.fill("0");
    await cashOut.blur();

    await expect(cashOut).toHaveValue("0");
    await expect(host.getByText("Saving…", { exact: true })).toBeVisible();

    releaseSave?.();
    await expect(host.getByText("Could not save", { exact: true })).toBeVisible();
    await expect(cashOut).toHaveValue("0");

    await host.unroute("**/rest/v1/rpc/save_cash_out", stallFirstCashOutSave);
    let releaseSnapshotRead: (() => void) | undefined;
    const snapshotReadReleased = new Promise<void>((resolve) => {
      releaseSnapshotRead = resolve;
    });
    let markSnapshotReadHeld: (() => void) | undefined;
    const snapshotReadHeld = new Promise<void>((resolve) => {
      markSnapshotReadHeld = resolve;
    });
    let successfulSaveStarted = false;
    const observeSuccessfulSave = async (route: Route) => {
      if (route.request().method() === "POST") successfulSaveStarted = true;
      await route.continue();
    };
    const holdSnapshotAfterSuccessfulSave = async (route: Route) => {
      if (route.request().method() === "GET" && successfulSaveStarted) {
        markSnapshotReadHeld?.();
        await snapshotReadReleased;
      }
      await route.continue();
    };
    await host.route("**/rest/v1/rpc/save_cash_out", observeSuccessfulSave);
    await host.route("**/rest/v1/cash_outs*", holdSnapshotAfterSuccessfulSave);
    await cashOut.focus();
    await cashOut.blur();
    await expect(host.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(cashOut).toHaveValue("0");
    await snapshotReadHeld;
    // The acknowledged write can precede the snapshot update. A no-edit blur
    // must retain the acknowledged draft while that read is still delayed.
    await cashOut.focus();
    await cashOut.blur();
    await expect(cashOut).toHaveValue("0");
    releaseSnapshotRead?.();
    // Let held handlers finish before unregistering them; otherwise unroute
    // can handle a released request before its own continuation resumes.
    await host.unrouteAll({ behavior: "wait" });
  } finally {
    await hostContext.close();
  }
});

test("holds a multi-user settlement until cash-outs reconcile", async ({ browser }) => {
  test.slow();
  const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
  const hostContext = await createDeviceContext(browser, mobile);
  const guestContext = await createDeviceContext(browser, mobile);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await createGame(host, "Realtime test game");
    await joinGame(guest, host.url(), "Jordan");
    await expectAutomaticOpeningBuyIn(guest);
    await expect(host.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
    await host.getByRole("button", { name: "Approve", exact: true }).click();

    await host.getByRole("button", { name: "End game" }).click();
    await host.getByRole("button", { name: "Start cash-outs" }).click();
    await expect(guest.getByRole("heading", { name: "Cash-outs", exact: true })).toBeVisible();
    await expect(guest.getByRole("heading", { name: "Your cash-out", exact: true })).toBeVisible();
    await expect(guest.getByRole("heading", { name: "Table cash-outs", exact: true })).toBeVisible();
    await expect(guest.locator('ul[aria-label="Table cash-outs"]').getByRole("textbox")).toHaveCount(0);

    await host.getByRole("spinbutton", { name: "Cash-out amount for Casey" }).fill("20");
    await host.getByRole("spinbutton", { name: "Cash-out amount for Casey" }).blur();
    await guest.getByRole("textbox", { name: "Cash-out amount for Jordan" }).fill("10");
    await guest.getByRole("textbox", { name: "Cash-out amount for Jordan" }).blur();

    await expect(host.getByText(/\$[\d,.]+ (short in|extra in) cash-outs/)).toBeVisible();
    await expect(host.getByRole("button", { name: /^Resolve .* difference$/ })).toBeEnabled();

    await host.getByRole("spinbutton", { name: "Cash-out amount for Casey" }).fill("30");
    await host.getByRole("spinbutton", { name: "Cash-out amount for Casey" }).blur();
    await expect(host.getByText("Bank reconciled", { exact: true })).toBeVisible();
    await expect(host.getByRole("button", { name: "Review settlement" })).toBeEnabled();

    await guest.getByRole("textbox", { name: "Cash-out amount for Jordan" }).fill("20");
    await guest.getByRole("textbox", { name: "Cash-out amount for Jordan" }).blur();
    await expect(host.getByRole("spinbutton", { name: "Cash-out amount for Jordan" })).toHaveValue("20");
    await expect(host.getByText(/\$[\d,.]+ (short in|extra in) cash-outs/)).toBeVisible();

    await guest.getByRole("textbox", { name: "Cash-out amount for Jordan" }).fill("10");
    await guest.getByRole("textbox", { name: "Cash-out amount for Jordan" }).blur();
    await expect(guest.getByText("Saved", { exact: true })).toBeVisible();
    await expect(host.getByRole("spinbutton", { name: "Cash-out amount for Jordan" })).toHaveValue("10", {
      timeout: 15_000,
    });
    await expect(host.getByText("Bank reconciled", { exact: true })).toBeVisible();

    await host.getByRole("button", { name: "Review settlement" }).click();

    const hostPlan = host.locator('[data-testid="full-settlement-plan"]');
    await expect(hostPlan).toHaveJSProperty("open", false);
    await expect(host.getByRole("region", { name: "Ready to settle?" })).toBeVisible();
    await expect(host.getByRole("button", { name: "Mark sent" })).toHaveCount(0);

    await expect(guest.getByRole("button", { name: "Preview settlement" })).toHaveCount(0);
    await expect(guest.getByText("Cash-outs are in.", { exact: true })).toBeVisible();
    await expect(guest.getByText("Waiting for Casey to finalize the settlement. Payment instructions will appear once it's locked.")).toBeVisible();
    await expect(guest.getByRole("button", { name: "Mark sent" })).toHaveCount(0);

    await host.getByRole("button", { name: "Lock settlement" }).click();
    await host.getByRole("alertdialog").getByRole("button", { name: "Lock settlement" }).click();
    const hostSettlement = host.getByRole("region", { name: "$10.00 coming to you." });
    await expect(hostSettlement).toBeVisible();
    await expect(hostSettlement.getByText("Payments coming to you", { exact: true })).toBeVisible();
    await expect(hostSettlement.getByRole("listitem")).toContainText("From Jordan");
    const guestSettlement = guest.getByRole("region", { name: "You owe $10.00." });
    await expect(guestSettlement).toBeVisible();
    await expect(guestSettlement.getByRole("listitem")).toContainText("Casey");
    await expect(guest.locator('[data-testid="full-settlement-plan"]')).toHaveCount(0);
    const guestLedger = guest.locator('[data-testid="payment-ledger"]');
    await expect(guestLedger.locator(":scope > summary")).toContainText("0 of 1 payment marked sent");
    await guestLedger.locator(":scope > summary").click();
    await expect(guestLedger.getByRole("listitem")).toContainText("Jordan → Casey");
    const markSent = guest.getByRole("checkbox", { name: /^Mark sent:/ }).first();
    const markSentControl = guest.getByTitle("Mark sent").first();
    const [paymentWrite] = await Promise.all([
      guest.waitForResponse((response) =>
        response.url().includes("/rest/v1/rpc/set_settlement_payment_status_guarded"),
        { timeout: 15_000 },
      ),
      markSentControl.click(),
    ]);
    expect(paymentWrite.ok()).toBe(true);
    await expect(markSent).toBeChecked();
    await expect(guest.getByText("Payment marked sent", { exact: true })).toBeVisible();
    await expect(guest.getByRole("heading", { name: "All your payments are marked sent." })).toBeVisible();
    await expect(host.getByRole("heading", { name: "All payments to you are marked sent." })).toBeVisible();
    await expect(guestLedger.locator(":scope > summary")).toContainText("1 of 1 payment marked sent", { timeout: 15_000 });
    await expect(host.locator('[data-testid="payment-ledger"] > summary')).toContainText("1 of 1 payment marked sent", { timeout: 15_000 });
    await expect(hostPlan).toContainText("1/1 marked sent", { timeout: 15_000 });
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});

test("runs a whole table with host-added players", async ({ page }) => {
  test.slow();
  await runHostPlayerFlow(page);
});

test("syncs host-added players to guests without exposing host controls", async ({ browser }) => {
  const hostContext = await createDeviceContext(browser);
  const guestContext = await createDeviceContext(browser);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  try {
    await createGame(host, "Realtime test game");
    await joinGame(guest, host.url(), "Jordan");
    await host.getByRole("button", { name: "Add player", exact: true }).click();
    const add = host.getByRole("dialog", { name: "Add a player" });
    await add.getByRole("textbox", { name: "Player name" }).fill("Taylor");
    await add.getByRole("button", { name: "Add player", exact: true }).click();
    await expect(playerCard(guest, "Taylor")).toContainText("$20.00");
    await expect(playerCard(guest, "Taylor")).toContainText("Host-managed");
    await expect(guest.getByRole("button", { name: "Add player", exact: true })).toHaveCount(0);
    await expect(guest.getByRole("button", { name: /Manage Taylor/ })).toHaveCount(0);
    await host.getByRole("button", { name: "Manage Taylor" }).click();
    const manage = host.getByRole("dialog", { name: "Manage Taylor" });
    await manage.getByRole("textbox", { name: "Buy-in amount" }).fill("5");
    await manage.getByRole("button", { name: "Record buy-in" }).click();
    await expect(playerCard(guest, "Taylor")).toContainText("$25.00");
    await expect(playerCard(guest, "Taylor")).toContainText("2 entries");
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});

test("keeps sign-in controls disabled until client handlers are ready", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  let releaseScripts!: () => void;
  const scriptGate = new Promise<void>(resolve => { releaseScripts = resolve; });
  const scriptHandlers: Promise<void>[] = [];
  let blockedScripts = 0;
  const scriptPattern = /\/_next\/static\/.*\.js(?:\?|$)/;
  const holdScripts = (route: Route) => {
    blockedScripts += 1;
    const pending = scriptGate.then(() => route.continue());
    scriptHandlers.push(pending);
    return pending;
  };
  const authWrites: string[] = [];
  const readOnlyAuth = (route: Route) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
      authWrites.push(new URL(route.request().url()).pathname);
      return route.abort();
    }
    return route.continue();
  };
  await page.route(scriptPattern, holdScripts);
  await page.route("**/auth/v1/**", readOnlyAuth);
  try {
    await page.goto("/signin", { waitUntil: "commit" });
    const email = page.getByLabel("Email", { exact: true });
    const password = page.getByLabel("Password", { exact: true });
    const toggle = page.getByRole("button", { name: "Create an account", exact: true });
    await expect.poll(() => blockedScripts).toBeGreaterThan(0);
    await expect(email).toBeDisabled();
    await expect(password).toBeDisabled();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeDisabled();
    await expect(toggle).toBeDisabled();
    releaseScripts();
    await expect(email).toBeEnabled();
    await email.fill("hydration-check@example.invalid");
    await password.fill("synthetic-placeholder");
    await toggle.click();
    await expect(page.getByLabel("Display name", { exact: true })).toBeVisible();
    await expect(email).toHaveValue("hydration-check@example.invalid");
    await expect(password).toHaveValue("synthetic-placeholder");
    expect(authWrites).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    releaseScripts();
    await Promise.all(scriptHandlers);
    await page.unroute(scriptPattern, holdScripts);
    await page.unroute("**/auth/v1/**", readOnlyAuth);
  }
});

test("restores an account-owned seat and settled history across browsers", async ({ browser, baseURL }) => {
  test.slow();
  await checkAccountRecovery(browser, baseURL!);
});

test("delivers saved-friend invitations before the friend has room access", async ({ browser, baseURL }) => {
  test.slow();
  await checkSavedFriendInvitation(browser, baseURL!);
});


test("shares a selected bank plan and keeps both bank payment directions visible", async ({ browser, baseURL }, testInfo) => {
  test.slow();
  await runBankPlanFlow(browser, baseURL!, `docs/audits/2026-09-26/evidence/${testInfo.project.name}-bank`);
});


test("keeps guest-host ownership after account signup across devices", async ({ browser, baseURL }) => {
  test.slow();
  await runGuestAccountTransfer(browser, baseURL!);
});

test("ends an expired guest recovery window without trapping the signed-in account", async ({ browser, baseURL }) => {
  test.slow();
  await runExpiredGuestRecoveryWindowFlow(browser, baseURL!);
});

test("starts a second guest table and keeps both unfinished games recoverable", async ({ page }) => {
  await createGame(page, "First unfinished table");
  const firstUrl = page.url();
  await page.goto("/create");
  await expect(page.getByRole("region", { name: "Resume active game" })).toContainText("First unfinished table");
  await page.locator("#create-name").fill("Casey");
  await page.locator("#create-game-name").fill("Second unfinished table");
  await page.locator("#create-buy-in").fill("20");
  await page.getByRole("button", { name: "Start another game", exact: true }).click();
  await expect(page).toHaveURL(/\/game\/[A-HJ-NP-Z2-9]{6}$/, { timeout: 15_000 });
  const secondUrl = page.url();
  expect(secondUrl).not.toBe(firstUrl);
  await page.goto("/create");
  const recovery = page.getByRole("region", { name: "Resume active game" });
  await expect(recovery).toHaveCount(2);
  await expect(recovery.filter({ hasText: "First unfinished table" })).toBeVisible();
  await expect(recovery.filter({ hasText: "Second unfinished table" })).toBeVisible();
  await page.locator("#create-name").fill("Casey");
  await page.locator("#create-game-name").fill("Third table");
  await page.locator("#create-buy-in").fill("20");
  await page.getByRole("button", { name: "Start another game", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start another game", exact: true })).toBeEnabled();
  await recovery.filter({ hasText: "First unfinished table" }).getByRole("button", { name: "Resume game" }).click();
  await expect(page).toHaveURL(firstUrl);
  await expect(page.getByRole("button", { name: "End game", exact: true })).toBeEnabled();
  await expect(page.getByText("Pot", { exact: true }).locator("..")).toContainText("$20.00");
});

test("recovers the same created table after its committed response is lost", async ({ browser, baseURL }) => {
  test.slow();
  const context = await createDeviceContext(browser, { baseURL });
  const page = await context.newPage();
  let committedCode: string | undefined;
  try {
    const loseResponse = async (route: Route) => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      const rows = await response.json();
      committedCode = (Array.isArray(rows) ? rows[0] : rows).code;
      await new Promise(resolve => setTimeout(resolve, 20_000));
      await route.abort().catch(() => undefined);
    };
    await page.route("**/rest/v1/rpc/create_game_idempotent", loseResponse);
    await page.goto("/create");
    await page.locator("#create-name").fill("Casey");
    await page.locator("#create-game-name").fill("Lost creation response");
    await page.locator("#create-buy-in").fill("20");
    await page.getByRole("button", { name: "Create game", exact: true }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("couldn't confirm whether your game was created", { timeout: 18_000 });
    expect(committedCode).toBeTruthy();
    await expect(page.getByRole("button", { name: "Create game", exact: true })).toBeEnabled();
    await page.unroute("**/rest/v1/rpc/create_game_idempotent", loseResponse);
    await page.getByRole("button", { name: "Create game", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/game/${committedCode}$`), { timeout: 15_000 });
    await expect(page.getByRole("region", { name: "At the table" }).getByRole("listitem")).toHaveCount(1);
    await expect(page.getByText("Pot", { exact: true }).locator("..")).toContainText("$20.00");
    await page.goto("/create");
    await expect(page.getByRole("region", { name: "Resume active game" })).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Resume active game" })).toContainText("Lost creation response");
  } finally {
    await context.close();
  }
});

test("retries a temporary future-JWT rejection with the same creation request", async ({ browser, baseURL }) => {
  const context = await createDeviceContext(browser, { baseURL });
  const page = await context.newPage();
  let attempts = 0;
  let originalPayload: string | null = null;
  try {
    await page.route("**/rest/v1/rpc/create_game_idempotent", async route => {
      attempts++;
      if (attempts === 1) {
        originalPayload = route.request().postData();
        await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "PGRST303", message: "JWT issued at future" }) });
      } else {
        expect(route.request().postData()).toBe(originalPayload);
        await route.continue();
      }
    });
    await createGame(page, "Temporary auth rejection");
    await expect(page.getByRole("button", { name: "End game", exact: true })).toBeEnabled();
    expect(attempts).toBe(2);
    await expect(page.getByRole("region", { name: "At the table" }).getByRole("listitem")).toHaveCount(1);
    await expect(page.getByText("Pot", { exact: true }).locator("..")).toContainText("$20.00");
  } finally {
    await context.close();
  }
});

test("keeps failed payment reads unknown and retries without duplicate sends", async ({ browser, baseURL }) => {
  test.slow();
  await runPaymentReadRecoveryFlow(browser, baseURL!);
});

test("rejects duplicate lobby names even when two devices join together", async ({ browser, baseURL }) => {
  test.slow();
  await runLobbyNameGuardFlow(browser, baseURL!);
});

test("claims and restores the same host-managed seat without another buy-in", async ({ browser, baseURL }) => {
  test.slow();
  await runSeatContinuityFlow(browser, baseURL!);
});
