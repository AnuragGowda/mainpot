import { checkCalculatorValidation } from "./audit-fixes-flow";
import { runHostPlayerFlow } from "./host-player-flow";
import { runSettlementUxFlow } from "./settlement-ux-flow";
import { expect, test } from "@playwright/test";
import { checkPwaRecovery } from "./pwa-flow";

const runtimeErrors = new WeakMap<import("@playwright/test").Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? [], "The journey must not leave uncaught browser errors").toEqual([]);
});

test.describe("public local-mode experience", () => {
  // Keep network mocks deterministic in WebKit; a registered service worker
  // can otherwise answer the request before Playwright's route handler.
  test.use({ serviceWorkers: "block" });

  test("reviews payments before locking and keeps completion in sync", async ({ page }) => {
    test.slow();
    await runSettlementUxFlow(page);
  });

  test("runs a whole table with host-added players", async ({ page }) => {
    test.slow();
    await runHostPlayerFlow(page);
  });

  test("shows the landing page and validates an incomplete game form", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Keep the game friendly. Keep the money exact." })).toBeVisible();
    const closingCta = page.getByRole("region", { name: "Ready for your next poker night?" });
    await closingCta.getByRole("link", { name: "Start a game" }).click();

    await page.getByRole("button", { name: "Create game" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();
    await expect(page.locator("#create-name")).toBeFocused();
    await expect(page.getByText("Enter a game name.")).toBeVisible();
    await expect(page.getByText("Enter an amount.", { exact: true })).toBeVisible();
  });

  test("keeps invalid buy-in text visible and explains how to correct it", async ({ page }) => {
    await page.goto("/create");

    await expect(page.locator("#create-name")).toHaveAttribute("maxlength", "32");
    await expect(page.locator("#create-game-name")).toHaveAttribute("maxlength", "40");
    const buyIn = page.locator("#create-buy-in");
    await buyIn.fill("twenty dollars");
    await expect(buyIn).toHaveValue("twenty dollars");
    await page.locator("#create-name").fill("Casey");
    await page.locator("#create-game-name").fill("Validation test");
    await page.getByRole("button", { name: "Create game" }).click();
    await expect(page.getByText("Enter a valid amount.", { exact: true })).toBeVisible();
    await buyIn.fill("0.001");
    await page.getByRole("button", { name: "Create game" }).click();
    await expect(buyIn).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/create/);
    await buyIn.fill("20.50");
    await expect(buyIn).toHaveValue("20.50");
    await expect(page.getByText(/your opening buy-in of \$20\.50 will be recorded/i)).toBeVisible();
    const openingBuyIn = page.getByRole("checkbox", { name: "Add my opening buy-in" });
    const checkboxColor = await openingBuyIn.evaluate((checkbox) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) return [];
      context.fillStyle = getComputedStyle(checkbox).accentColor;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    });
    expect(checkboxColor).toEqual([3, 7, 18, 255]);
    await openingBuyIn.uncheck();
    await expect(page.getByText("Leave this off if you’re just hosting. You can buy in later.")).toBeVisible();
  });

  test("lets a host resume an active game from setup without clearing site data", async ({ page }) => {
    await page.goto("/create");
    await page.locator("#create-name").fill("Casey");
    await page.locator("#create-game-name").fill("Resume test game");
    await page.locator("#create-buy-in").fill("20");
    await page.getByRole("button", { name: "Create game" }).click();

    await expect(page).toHaveURL(/\/game\/[A-HJ-NP-Z2-9]{6}$/);
    const gameUrl = page.url();
    await page.goto("/create");

    const resume = page.getByRole("region", { name: "Resume active game" });
    await expect(resume).toContainText("Active game waiting");
    await expect(resume).toContainText("Resume test game");
    await resume.getByRole("button", { name: "Resume game" }).click();

    await expect(page).toHaveURL(gameUrl);
    await expect(page.getByRole("heading", { name: "Resume test game" })).toBeVisible();
  });

  test("offers contextual iPhone install steps after creating a game", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      });
      Object.defineProperty(navigator, "platform", { configurable: true, value: "iPhone" });
      Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
    });

    await page.goto("/create");
    await page.locator("#create-name").fill("Casey");
    await page.locator("#create-game-name").fill("Install prompt game");
    await page.locator("#create-buy-in").fill("20");
    await page.getByRole("button", { name: "Create game" }).click();

    await expect(page.getByRole("heading", { name: "Keep Mainpot one tap away." })).toBeVisible();
    const acquisitionPrompt = page.getByRole("region", { name: "How did you hear about Mainpot?" });
    const gameHeading = page.getByRole("heading", { name: "Install prompt game" });
    await expect(acquisitionPrompt).toBeVisible();
    expect(await acquisitionPrompt.evaluate((prompt, heading) => Boolean(
      prompt.compareDocumentPosition(heading as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ), await gameHeading.elementHandle())).toBe(true);
    await page.getByRole("button", { name: "Show me how" }).click();
    await expect(page.getByText("On iPhone or iPad", { exact: true })).toBeVisible();
    await expect(page.getByText(/choose Add to Home Screen/i)).toBeVisible();
    await page.getByRole("button", { name: "Got it" }).click();
    await expect(page.getByRole("heading", { name: "Keep Mainpot one tap away." })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Keep Mainpot one tap away." })).toHaveCount(0);
  });

  test("opens the native install prompt after creating a game", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value: "Mozilla/5.0 (Linux; Android 15; Pixel 9)",
      });
      Object.defineProperty(navigator, "platform", { configurable: true, value: "Linux armv8l" });
      Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
      window.__mainpotInstallPrompt = Object.assign(new Event("beforeinstallprompt"), {
        prompt: async () => window.sessionStorage.setItem("install_prompt_opened", "true"),
        userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
      });
    });
    await page.goto("/create");

    await page.locator("#create-name").fill("Casey");
    await page.locator("#create-game-name").fill("Native install game");
    await page.locator("#create-buy-in").fill("20");
    await page.getByRole("button", { name: "Create game" }).click();

    await page.getByRole("button", { name: "Install Mainpot" }).click();
    await expect(page.getByText("Mainpot installed — it’s ready for poker night.")).toBeVisible();
    await expect.poll(() => page.evaluate(
      () => window.sessionStorage.getItem("install_prompt_opened"),
    )).toBe("true");
    await expect(page.getByRole("heading", { name: "Keep Mainpot one tap away." })).toHaveCount(0);
  });

  test("runs a host from game creation through a balanced finalized settlement", async ({ page }) => {
    test.slow();
    await page.goto("/create");
    await page.locator("#create-name").fill("Casey");
    await page.locator("#create-game-name").fill("Friday test game");
    await page.locator("#create-buy-in").fill("20");
    await page.getByRole("button", { name: "Create game" }).click();

    await expect(page).toHaveURL(/\/game\/[A-HJ-NP-Z2-9]{6}$/);
    const roomCode = page.url().split("/").pop()!;
    await expect(page.getByRole("heading", { name: "Friday test game" })).toBeVisible();
    await expect(page.getByText(roomCode, { exact: true })).toHaveCount(0);
    await expect(page.getByText("Room code", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Invite players" }).click();
    const inviteDialog = page.getByRole("dialog", { name: /Scan to join/ });
    await expect(inviteDialog.getByText(roomCode, { exact: true })).toBeVisible();
    await inviteDialog.getByRole("button", { name: "Close invite" }).click();
    await expect(page.getByText("Saved on this device · live sync is off")).toBeVisible();

    await expect(page.getByText("Pot", { exact: true }).locator("..").getByText("$20.00", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a rebuy" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Buy in ·/ })).toHaveCount(0);

    const endGameButton = page.getByRole("button", { name: "End game" });
    await endGameButton.click();
    const endGameDialog = page.getByRole("alertdialog", { name: "End the game?" });
    await expect(endGameDialog).toBeVisible();
    await expect(endGameDialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await endGameDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(endGameDialog).toHaveCount(0);
    await expect(endGameButton).toBeFocused();
    await endGameButton.click();
    await page.getByRole("button", { name: "Start cash-outs" }).click();
    await expect(page.getByRole("heading", { name: "Cash-outs", exact: true })).toBeVisible();
    await expect(page.getByText(roomCode, { exact: true })).toHaveCount(0);
    await expect(page.getByText("Room code", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "0 of 1 cash-outs entered" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review settlement" })).toBeDisabled();

    const cashOut = page.getByRole("spinbutton", { name: "Cash-out amount for Casey" });
    await cashOut.fill("20");
    await cashOut.blur();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(page.getByText("Bank reconciled", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Review settlement" }).click();

    const finalizeButton = page.getByRole("button", { name: "Lock settlement" });
    const editCashOutsButton = page.getByRole("button", { name: "Edit cash-outs" });
    const fullPlan = page.locator('[data-testid="full-settlement-plan"]');
    const fullPlanSummary = fullPlan.locator(":scope > summary");
    await expect(fullPlan).toHaveJSProperty("open", false);
    await expect(page.getByText("Locking fixes the cash-outs and opens payment tracking.")).toBeVisible();
    await expect(editCashOutsButton).toBeVisible();
    await expect(page.getByRole("region", { name: "You're even." })).toHaveCount(0);
    await fullPlanSummary.click();
    await expect(fullPlan.getByRole("tab", { name: "Fewest payments" })).toBeEnabled();
    await expect(fullPlan.getByRole("tab", { name: "Bank" })).toBeEnabled();
    await fullPlanSummary.click();
    expect(await finalizeButton.evaluate((button, plan) => Boolean(
      button.compareDocumentPosition(plan as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ), await fullPlan.elementHandle())).toBe(true);

    await editCashOutsButton.click();
    await expect(cashOut).toBeVisible();
    await page.getByRole("button", { name: "Review settlement" }).click();

    await page.getByRole("radio", { name: /Table bank/ }).check();
    await expect(page.locator("#final-bank-player-select")).toContainText("Casey");

    await finalizeButton.click();
    await expect(page.getByRole("alertdialog", { name: "Lock the final settlement?" })).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: "Lock settlement" }).click();
    await expect(page.getByText("Ended", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "You're even." })).toBeVisible();
    const revealCardButton = page.getByRole("button", { name: "Reveal your game card" });
    await expect(revealCardButton).toBeVisible();
    await expect(revealCardButton.getByText("Tap to reveal", { exact: true })).toBeVisible();
    await expect(page.locator('[data-recap-reveal]')).toHaveAttribute('data-recap-reveal', 'ready');
    await revealCardButton.click();
    await expect(page.getByRole("button", { name: "Your game card is being revealed" })).toBeDisabled();
    await expect(page.locator('[data-recap-reveal]')).toHaveAttribute('data-recap-reveal', 'revealing');
    const gameCardButton = page.getByRole("button", { name: "Customize and share your game card" });
    await expect(gameCardButton).toBeVisible();
    await expect(gameCardButton.getByText("Customize & share", { exact: true })).toBeVisible();
    await expect(page.locator('[data-recap-reveal]')).toHaveAttribute('data-recap-reveal', 'complete');
    await expect(fullPlanSummary).toContainText("Full settlement plan");
    await expect(fullPlanSummary).toContainText("Host view");
    await expect(fullPlan).toHaveJSProperty("open", false);
    await expect(page.getByRole("tab", { name: "Fewest payments" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Bank" })).toHaveCount(0);
    await fullPlanSummary.click();
    await expect(fullPlan.getByRole("heading", { name: "Bank settlements" })).toBeVisible();
    await expect(fullPlan.getByText("Settlements (bank: Casey):", { exact: true })).toBeVisible();
    await page.reload();
    const reloadedFullPlan = page.locator('[data-testid="full-settlement-plan"]');
    await reloadedFullPlan.locator(":scope > summary").click();
    await expect(reloadedFullPlan.getByRole("heading", { name: "Bank settlements" })).toBeVisible();
    await expect(reloadedFullPlan.getByText("Settlements (bank: Casey):", { exact: true })).toBeVisible();
    const feedbackPrompt = page.getByText("How did game night go?", { exact: true });
    await expect(feedbackPrompt).toBeVisible();
    const gameHeading = page.getByRole("heading", { name: "Friday test game" });
    expect(await feedbackPrompt.evaluate((prompt, heading) => Boolean(
      prompt.compareDocumentPosition(heading as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ), await gameHeading.elementHandle())).toBe(true);
    await feedbackPrompt.click();
    const feedbackRating = page.getByRole("radio", { name: "3 of 5", exact: true });
    await feedbackRating.locator("..").click();
    await feedbackRating.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "4 of 5", exact: true })).toBeChecked();
    await page.getByRole("button", { name: "Dismiss feedback prompt" }).click();
    await expect(page.getByText("How did game night go?", { exact: true })).toHaveCount(0);
    await fullPlanSummary.click();
    await expect(fullPlan).toHaveJSProperty("open", true);
    await expect(page.getByText("Settlement locked", { exact: true })).toBeVisible();
    const paymentRecord = page.locator("summary").filter({ hasText: "Payment record" }).locator("..");
    await expect(paymentRecord.getByRole("button", { name: "Copy payment record" })).toBeVisible();
    await expect(paymentRecord.getByRole("button", { name: "Share payment record" })).toBeVisible();
    await paymentRecord.getByRole("button", { name: "Copy payment record" }).click();
    await expect(paymentRecord).not.toHaveAttribute("open", "");
    await paymentRecord.getByText("Payment record", { exact: true }).click();
    await expect(paymentRecord).toHaveAttribute("open", "");
    const recapButton = page.getByRole("button", { name: "Customize and share your game card" });
    expect(await recapButton.evaluate((card, plan) => Boolean(
      card.compareDocumentPosition(plan as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ), await fullPlan.elementHandle())).toBe(true);

    await recapButton.click();
    const recapDialog = page.getByRole("dialog", { name: "Your game card" });
    await expect(recapDialog).toBeVisible();
    await expect(page.getByRole("button", { name: /Share (your story|game card)/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /save.*image/i })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "What can people see?" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Show amounts and losses" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Show player names" })).toHaveCount(0);
    const recapGraphic = recapDialog.locator("svg[viewBox='0 0 1080 1920']");
    await expect(recapDialog.locator('[data-recap-reveal]')).toHaveAttribute('data-recap-reveal', 'complete');
    await expect(recapGraphic).toContainText(/The Break-Even Baron|The Table Celebrity|The Group Chat Correspondent/);
    await expect(page.getByRole("button", { name: "Try another title" })).toHaveCount(0);
    await expect(recapGraphic).toContainText("Good nights make great characters.");
    await expect(recapGraphic).not.toContainText("Friday test game");
    await expect(recapGraphic).not.toContainText("Casey");
    await expect(recapGraphic).toContainText("$20");
    await page.getByRole("checkbox", { name: "Show amounts and losses" }).uncheck();
    await expect(recapGraphic).not.toContainText("$");
    await expect(recapGraphic).not.toContainText("NET RESULT");
    await expect(recapGraphic).not.toContainText("The Break-Even Baron");
    await expect(recapGraphic).toContainText(/The Table Celebrity|The Group Chat Correspondent/);
    await page.getByRole("checkbox", { name: "Show player count" }).uncheck();
    await expect(recapGraphic).not.toContainText("PLAYERS");
    await page.getByRole("checkbox", { name: "Show game duration" }).uncheck();
    await expect(recapGraphic).not.toContainText("DURATION");
    await page.getByRole("checkbox", { name: "Show amounts and losses" }).check();
    await expect(recapGraphic).toContainText("$20");

    await expect(page.getByRole("checkbox", { name: "Show dollar amounts" })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Show losses" })).toHaveCount(0);
    await expect(page.getByText("Who gets the card?", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Choose a layout", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Tap for another", { exact: true })).toHaveCount(0);
    await page.evaluate(() => Object.defineProperty(navigator, "share", { configurable: true, value: undefined }));
    const imageDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: /Share (your story|game card)/ }).click();
    const imageStream = await (await imageDownload).createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of imageStream!) chunks.push(Buffer.from(chunk));
    const png = Buffer.concat(chunks);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([2160, 3840]);

    const sharedCardText = await recapGraphic.textContent();
    await page.getByRole("button", { name: "Close game recap" }).click();
    await recapButton.click();
    await expect(recapDialog.locator('[data-recap-reveal]')).toHaveAttribute('data-recap-reveal', 'complete');
    await expect(page.getByRole('button', { name: 'Skip reveal' })).toHaveCount(0);
    await expect(recapGraphic).toHaveText(sharedCardText!);
    await expect(page.getByRole('checkbox', { name: 'Show player count' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Show game duration' })).not.toBeChecked();
    await page.getByRole('button', { name: 'Close game recap' }).click();

    await expect(page.getByRole("button", { name: "Edit cash-outs" })).toHaveCount(0);
    await expect(page.getByRole("spinbutton", { name: "Cash-out amount for Casey" })).toHaveCount(0);
  });

  test("auto-approves a host rebuy in local mode", async ({ page }) => {
    await page.goto("/create");
    await page.locator("#create-name").fill("Casey");
    await page.locator("#create-game-name").fill("Host rebuy game");
    await page.locator("#create-buy-in").fill("20");
    await page.getByRole("button", { name: "Create game" }).click();

    await page.getByRole("button", { name: "Add a rebuy" }).click();
    const rebuyDialog = page.getByRole("dialog", { name: "Add a rebuy" });
    await expect(rebuyDialog).toContainText("Record new chips received from the table's bank.");
    await expect(
      rebuyDialog.getByRole("checkbox", { name: "Someone else paid and I still owe them" }),
    ).toHaveCount(0);
    await page.getByRole("spinbutton", { name: "Rebuy amount" }).fill("15");
    await page.getByRole("button", { name: "Add rebuy" }).click();

    await expect(page.getByText("Rebuy added", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Needs approval" })).toHaveCount(0);
    await expect(
      page.getByText("Pot", { exact: true }).locator("..").getByText("$35.00", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "End game" })).toBeEnabled();
  });

  test("requires an explicit allocation when completed cash-outs do not reconcile", async ({ page }) => {
    await page.goto("/create");
    await page.locator("#create-name").fill("Casey");
    await page.locator("#create-game-name").fill("Discrepancy test game");
    await page.locator("#create-buy-in").fill("20");
    await page.getByRole("button", { name: "Create game" }).click();

    await page.getByRole("button", { name: "End game" }).click();
    await page.getByRole("button", { name: "Start cash-outs" }).click();
    const cashOut = page.getByRole("spinbutton", { name: "Cash-out amount for Casey" });
    await cashOut.fill("19");
    await cashOut.blur();

    await expect(page.getByText(/\$[\d,.]+ (short in|extra in) cash-outs/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Resolve $1.00 difference" })).toBeEnabled();
    await page.getByRole("button", { name: "Resolve $1.00 difference" }).click();

    await expect(page.getByRole("heading", { name: "Resolve the $1.00 difference" })).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    const reviewButton = page.getByRole("button", { name: "Review adjusted settlement" });
    const allocationPreview = page.getByRole("group", { name: "Discrepancy impact" });
    await expect(allocationPreview).toContainText("all affected players, proportional");

    await page.getByRole("radio", { name: /Enter exact amounts/ }).check();
    await expect(reviewButton).toBeDisabled();
    await page.getByRole("spinbutton", { name: "Exact discrepancy adjustment for Casey" }).fill("1");
    await expect(allocationPreview).toContainText("Discrepancy: $1.00 · exact amounts");
    await expect(reviewButton).toBeEnabled();
    await reviewButton.click();
    await expect(page.getByRole("region", { name: "Ready to settle?" })).toBeVisible();
    const discrepancyImpact = page.getByRole("group", { name: "Discrepancy impact" });
    await expect(discrepancyImpact).toBeVisible();
    await expect(discrepancyImpact).toContainText("Discrepancy: $1.00 · exact amounts");
    await expect(discrepancyImpact.getByRole("listitem", {
      name: "Casey: -$1.00 before, +$1.00 adjustment, $0.00 final",
    })).toBeVisible();

    const fullPlan = page.locator('[data-testid="full-settlement-plan"]');
    await expect(fullPlan).toHaveJSProperty("open", false);
    await page.getByRole("button", { name: "Lock settlement" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Lock settlement" }).click();
    await expect(page.getByRole("heading", { name: "You're even." })).toBeVisible();
    await expect(page.getByText("+$1.00 discrepancy adjustment · was -$1.00", { exact: true })).toBeVisible();

    await fullPlan.locator(":scope > summary").click();
    const paymentRecord = fullPlan.locator("summary").filter({ hasText: "Payment record" }).locator("..");
    await paymentRecord.getByText("Payment record", { exact: true }).click();
    await expect(paymentRecord.locator("pre")).toContainText(
      "Casey: -$1.00 +$1.00 discrepancy → $0.00",
    );
    await expect(paymentRecord.locator("pre")).toContainText("Final net:");
  });

  test("keeps the complete game flow usable on a 320px-wide screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/create");
    await page.locator("#create-name").fill("Casey With A Long Name");
    await page.locator("#create-game-name").fill("Wednesday Night Very Long Poker Game");
    await page.locator("#create-buy-in").fill("20");
    await page.getByRole("button", { name: "Create game" }).click();

    const invite = page.getByRole("button", { name: "Invite players" });
    await expect(invite).toBeInViewport();
    const acquisition = page.getByRole("region", { name: "How did you hear about Mainpot?" });
    expect(await acquisition.evaluate((survey, button) => Boolean(
      survey.compareDocumentPosition(button as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ), await invite.elementHandle())).toBe(true);
    await expect(page.getByRole("button", { name: "Personal invite" })).toHaveCount(0);

    await invite.click();
    const inviteDialog = page.getByRole("dialog", { name: /Scan to join/ });
    await expect(inviteDialog).toBeVisible();
    await expect(inviteDialog.getByRole("button", { name: "Close invite" })).toBeFocused();
    await inviteDialog.getByRole("button", { name: "Copy code" }).click();
    const toast = page.getByText("Copied!", { exact: true });
    await expect(toast).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(invite).toBeFocused();
    const toastBox = await toast.boundingBox();
    const actionBox = await page.getByRole("button", { name: "Add a rebuy" }).boundingBox();
    expect(toastBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(actionBox!.y);

    await page.getByRole("button", { name: "Add a rebuy" }).click();
    const rebuyDialog = page.getByRole("dialog", { name: "Add a rebuy" });
    await expect(rebuyDialog).toBeVisible();
    const rebuyBox = await rebuyDialog.boundingBox();
    expect(rebuyBox).not.toBeNull();
    expect(rebuyBox!.y).toBeGreaterThanOrEqual(0);
    expect(rebuyBox!.y + rebuyBox!.height).toBeLessThanOrEqual(569);
    await rebuyDialog.getByRole("button", { name: "Cancel rebuy" }).click();

    await page.getByRole("button", { name: "End game" }).click();
    const endGameDialog = page.getByRole("alertdialog", { name: "End the game?" });
    await expect(endGameDialog).toBeVisible();
    await page.waitForTimeout(250);
    const endGameDialogBox = await endGameDialog.boundingBox();
    expect(endGameDialogBox).not.toBeNull();
    expect(endGameDialogBox!.y + endGameDialogBox!.height).toBeLessThanOrEqual(569);
    const startCashOutsButton = page.getByRole("button", { name: "Start cash-outs" });
    const cancelButton = endGameDialog.getByRole("button", { name: "Cancel" });
    await expect(startCashOutsButton).toBeVisible();
    const startCashOutsBox = await startCashOutsButton.boundingBox();
    const cancelBox = await cancelButton.boundingBox();
    expect(startCashOutsBox).not.toBeNull();
    expect(cancelBox).not.toBeNull();
    expect(startCashOutsBox!.y + startCashOutsBox!.height).toBeLessThanOrEqual(cancelBox!.y);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await startCashOutsButton.click();

    const cashOut = page.getByRole("spinbutton", {
      name: "Cash-out amount for Casey With A Long Name",
    });
    await cashOut.fill("20");
    await cashOut.blur();
    await expect(page.getByRole("button", { name: "Review settlement" })).toBeEnabled();
    await page.getByRole("button", { name: "Review settlement" }).click();
    await expect(
      page.getByRole("heading", { name: "Settlement results and payment plan" }),
    ).toBeFocused();
    await expect(page.getByText("Room code", { exact: true })).toHaveCount(0);

    const [finalizeBox, editBox] = await page
      .getByRole("region", { name: "Ready to settle?" })
      .getByRole("button")
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect();
          return { y: box.y, height: box.height };
        }),
      );
    expect(editBox.y).toBeGreaterThanOrEqual(finalizeBox.y + finalizeBox.height);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
  });

  test("offers a direct mobile path to the standalone calculator", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/poker-settlement-calculator");

    const firstPlayer = page.locator("#player-1");
    await expect(firstPlayer).toBeVisible();
    await firstPlayer.scrollIntoViewIfNeeded();
    await expect(firstPlayer).toBeInViewport();
    await expect(page.getByRole("link", { name: "How settlement works" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
  });

  test("lets a visitor clear the calculator example and use the keyboard skip link", async ({ page }) => {
    await page.goto("/poker-settlement-calculator");
    const skipLink = page.getByRole("link", { name: "Skip to content" });
    // WebKit follows the platform setting that may skip links during Tab navigation.
    await skipLink.focus();
    await expect(skipLink).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await page.getByRole("button", { name: "Clear example" }).click();
    await expect(page.locator("#player-1")).toBeFocused();
    await expect(page.locator("#calculator").getByRole("textbox")).toHaveCount(6);
    await page.locator("#player-1").fill("Alex");
    await page.locator("#player-2").fill("Sam");
    await page.getByLabel("Money in for Alex").fill("20");
    await page.getByLabel("Money in for Sam").fill("20");
    await page.getByLabel("Final stack for Alex").fill("30");
    await page.getByLabel("Final stack for Sam").fill("10");
    await page.getByRole("link", { name: "View payments ↓" }).click();
    await expect(page.getByRole("complementary", { name: "Settlement results" })).toBeFocused();
    await expect(page.locator("#calculator-results")).toContainText("$10.00");
    await expect(page.locator("#calculator-results")).toContainText("Alex");
    await expect(page.locator("#calculator-results")).toContainText("Sam");
  });

});

test("does not show a settlement for invalid calculator amounts", async ({ page }) => {
  await checkCalculatorValidation(page);
});

test("recovers the same game after a real PWA offline navigation", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium", "Playwright does not expose WebKit service worker control; physical iOS PWA validation remains required.");
  test.slow();
  await checkPwaRecovery(page, `docs/audits/2026-09-26/evidence/${testInfo.project.name}-pwa`);
});
