import { expect, test } from "@playwright/test";

test.describe("public local-mode experience", () => {
  // Keep network mocks deterministic in WebKit; a registered service worker
  // can otherwise answer the request before Playwright's route handler.
  test.use({ serviceWorkers: "block" });

  test("shows the landing page and validates an incomplete game form", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Keep the game friendly. Keep the money exact." })).toBeVisible();
    await page.getByRole("link", { name: /Start( a)? game/i }).first().click();

    await page.getByRole("button", { name: "Create game" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();
    await expect(page.getByText("Enter a game name.")).toBeVisible();
    await expect(page.getByText("Enter an amount greater than 0.")).toBeVisible();
  });

  test("only accepts numeric characters for the buy-in amount", async ({ page }) => {
    await page.goto("/create");

    await expect(page.locator("#create-name")).toHaveAttribute("maxlength", "32");
    await expect(page.locator("#create-game-name")).toHaveAttribute("maxlength", "40");
    const buyIn = page.locator("#create-buy-in");
    await buyIn.fill("twenty dollars");
    await expect(buyIn).toHaveValue("");
    await buyIn.fill("20.50");
    await expect(buyIn).toHaveValue("20.50");
    await expect(page.getByText(/automatically records your opening buy-in of \$20\.50/i)).toBeVisible();
  });

  test("offers contextual iPhone install steps after creating a game", async ({ page }) => {
    await page.route("**/api/push/config", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: true, publicKey: "test-public-key" }),
    }));
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

    await expect(page.getByRole("heading", {
      name: "Put your phone down. We’ll tell you when it matters.",
    })).toBeVisible();
    await expect(page.getByText("How did you hear about Mainpot?")).toBeVisible();
    await page.getByRole("button", { name: "Show install steps" }).click();
    await expect(page.getByText("On iPhone or iPad", { exact: true })).toBeVisible();
    await expect(page.getByText(/choose Add to Home Screen/i)).toBeVisible();
  });

  test("runs a host from game creation through a balanced finalized settlement", async ({ page }) => {
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
    await expect(page.getByText("0 of 1 cash-outs entered", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Calculate settlement" })).toBeDisabled();

    const cashOut = page.getByRole("spinbutton", { name: "Cash-out amount for Casey" });
    await cashOut.fill("20");
    await cashOut.blur();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(page.getByText("Bank reconciled", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Calculate settlement" }).click();

    const finalizeButton = page.getByRole("button", { name: "Finalize game" });
    const editCashOutsButton = page.getByRole("button", { name: "Edit cash-outs" });
    const fullPlan = page.locator('[data-testid="full-settlement-plan"]');
    await expect(fullPlan).toHaveJSProperty("open", false);
    await expect(page.getByText(/Payment tracking starts after the lock/)).toBeVisible();
    await expect(editCashOutsButton).toBeVisible();
    expect(await finalizeButton.evaluate((button, plan) => Boolean(
      button.compareDocumentPosition(plan as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ), await fullPlan.elementHandle())).toBe(true);

    await editCashOutsButton.click();
    await expect(cashOut).toBeVisible();
    await page.getByRole("button", { name: "Calculate settlement" }).click();

    await finalizeButton.click();
    await expect(page.getByRole("alertdialog", { name: "Lock the final settlement?" })).toBeVisible();
    await page.getByRole("button", { name: "Lock settlement" }).click();
    await expect(page.getByText("Ended", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open your game card" })).toBeVisible();
    await expect(page.getByText("Full settlement plan", { exact: true })).toBeVisible();
    await expect(fullPlan).toHaveJSProperty("open", true);
    await expect(page.getByRole("tab", { name: "Fewest payments" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Bank" })).toHaveCount(0);
    const feedbackPrompt = page.getByText("How did game night go?", { exact: true });
    await expect(feedbackPrompt).toBeVisible();
    expect(await feedbackPrompt.evaluate((prompt, plan) => Boolean(
      prompt.compareDocumentPosition(plan as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ), await fullPlan.elementHandle())).toBe(true);
    await page.getByRole("button", { name: "Dismiss feedback prompt" }).click();
    await expect(page.getByText("How did game night go?", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Settlement locked", { exact: true })).toBeVisible();
    const paymentRecord = page.locator("summary").filter({ hasText: "Payment record" }).locator("..");
    await expect(paymentRecord.getByRole("button", { name: "Copy payment record" })).toBeVisible();
    await expect(paymentRecord.getByRole("button", { name: "Share payment record" })).toBeVisible();
    await paymentRecord.getByRole("button", { name: "Copy payment record" }).click();
    await expect(paymentRecord).not.toHaveAttribute("open", "");
    await paymentRecord.getByText("Payment record", { exact: true }).click();
    await expect(paymentRecord).toHaveAttribute("open", "");
    const recapButton = page.getByRole("button", { name: "Open your game card" });
    expect(await recapButton.evaluate((card, plan) => Boolean(
      card.compareDocumentPosition(plan as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ), await fullPlan.elementHandle())).toBe(true);

    await recapButton.click();
    await expect(page.getByRole("dialog", { name: "Your game card" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Share your story", exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: "What can people see?" })).toBeVisible();
    await expect(page.getByText("Who gets the card?", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Choose a layout", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Tap for another", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Close game recap" }).click();

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
    await expect(page.getByText("Who handed over the cash? This affects settlement only; the chips stay with you.")).toBeVisible();
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

    await expect(page.getByText("Cash-outs don't match buy-ins", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Calculate settlement" })).toBeDisabled();
    await page.getByRole("button", { name: "Resolve discrepancy" }).click();

    await expect(page.getByText("Discrepancy decision", { exact: true })).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Review adjusted settlement" }).click();
    await expect(page.getByRole("region", { name: "Lock this settlement" })).toBeVisible();
    await expect(page.locator('[data-testid="full-settlement-plan"]')).toHaveJSProperty("open", false);
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
    await expect(page.getByText("How did you hear about Mainpot?")).toBeInViewport();
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
    await expect(page.getByRole("button", { name: "Calculate settlement" })).toBeEnabled();
    await page.getByRole("button", { name: "Calculate settlement" }).click();
    await expect(
      page.getByRole("heading", { name: "Settlement results and payment plan" }),
    ).toBeFocused();
    await expect(page.getByText("Room code", { exact: true })).toHaveCount(0);

    const [finalizeBox, editBox] = await page
      .getByRole("region", { name: "Lock this settlement" })
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

    const jump = page.getByRole("link", { name: "Jump to calculator" });
    await expect(jump).toBeVisible();
    await jump.click();
    await expect(page.locator("#calculator")).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
  });
});
