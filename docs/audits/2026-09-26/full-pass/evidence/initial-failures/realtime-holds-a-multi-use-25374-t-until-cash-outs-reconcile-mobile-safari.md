# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: realtime.spec.ts >> holds a multi-user settlement until cash-outs reconcile
- Location: tests/e2e/realtime.spec.ts:513:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Cash-outs', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Cash-outs', exact: true })

```

```yaml
- link "Skip to content":
  - /url: "#main-content"
- main:
  - heading "Realtime test game" [level=1]
  - text: Active
  - paragraph: Hosted by Casey
  - button "Invite players": Invite
  - paragraph: Buy-in
  - paragraph: $20.00
  - paragraph: Pot
  - paragraph: $40.00
  - paragraph: Players
  - paragraph: "2"
  - region "Keep Mainpot one tap away.":
    - paragraph: Add to your phone
    - heading "Keep Mainpot one tap away." [level=2]
    - paragraph: Add it to your Home Screen for faster access on poker night.
    - button "Show me how"
    - button "Not now"
  - region "At the table":
    - heading "At the table" [level=2]
    - paragraph: Host-confirmed entries by player.
    - list:
      - listitem:
        - paragraph: Casey
        - text: Host
        - paragraph: 1 entry
        - paragraph: $20.00
      - listitem:
        - paragraph: Jordan
        - text: You
        - paragraph: 1 entry
        - paragraph: $20.00
  - region "Activity":
    - heading "Activity" [level=2]
    - paragraph: Newest first.
    - text: 6 events
    - list:
      - listitem:
        - paragraph: Casey verified Jordan’s $20.00 buy-in
        - time: 1:17 PM
      - listitem:
        - paragraph: Jordan recorded a buy-in for $20.00
        - time: 1:17 PM
      - listitem:
        - paragraph: Jordan joined
        - time: 1:17 PM
      - listitem:
        - paragraph: Casey recorded a buy-in for $20.00
        - time: 1:17 PM
      - listitem:
        - paragraph: Casey joined
        - time: 1:17 PM
      - listitem:
        - paragraph: Casey opened the table
        - time: 1:17 PM
  - button "Add a rebuy"
  - button "Cash out"
- status
- alert
```

# Test source

```ts
  430 |     await expect(playerCard(host, "Jordan")).toContainText("$26.00");
  431 |   } finally {
  432 |     await guestContext.close();
  433 |     await hostContext.close();
  434 |   }
  435 | });
  436 | 
  437 | test("keeps a zero cash-out draft through a delayed failure and retries it", async ({ browser }) => {
  438 |   const hostContext = await createDeviceContext(browser);
  439 |   const host = await hostContext.newPage();
  440 |   let releaseSave: (() => void) | undefined;
  441 |   const saveReleased = new Promise<void>((resolve) => {
  442 |     releaseSave = resolve;
  443 |   });
  444 | 
  445 |   const stallFirstCashOutSave = async (route: Route) => {
  446 |     if (route.request().method() !== "POST") {
  447 |       await route.continue();
  448 |       return;
  449 |     }
  450 |     await saveReleased;
  451 |     await route.abort();
  452 |   };
  453 | 
  454 |   try {
  455 |     await createGame(host, "Realtime test game");
  456 |     await host.getByRole("button", { name: "End game" }).click();
  457 |     await host.getByRole("button", { name: "Start cash-outs" }).click();
  458 | 
  459 |     await host.route("**/rest/v1/cash_outs*", stallFirstCashOutSave);
  460 |     const cashOut = host.getByRole("spinbutton", { name: "Cash-out amount for Casey" });
  461 |     await cashOut.fill("0");
  462 |     await cashOut.blur();
  463 | 
  464 |     await expect(cashOut).toHaveValue("0");
  465 |     await expect(host.getByText("Saving…", { exact: true })).toBeVisible();
  466 | 
  467 |     releaseSave?.();
  468 |     await expect(host.getByText("Could not save", { exact: true })).toBeVisible();
  469 |     await expect(cashOut).toHaveValue("0");
  470 | 
  471 |     await host.unroute("**/rest/v1/cash_outs*", stallFirstCashOutSave);
  472 |     let releaseSnapshotRead: (() => void) | undefined;
  473 |     const snapshotReadReleased = new Promise<void>((resolve) => {
  474 |       releaseSnapshotRead = resolve;
  475 |     });
  476 |     let markSnapshotReadHeld: (() => void) | undefined;
  477 |     const snapshotReadHeld = new Promise<void>((resolve) => {
  478 |       markSnapshotReadHeld = resolve;
  479 |     });
  480 |     let successfulSaveStarted = false;
  481 |     const holdSnapshotAfterSuccessfulSave = async (route: Route) => {
  482 |       if (route.request().method() === "POST") {
  483 |         successfulSaveStarted = true;
  484 |         await route.continue();
  485 |         return;
  486 |       }
  487 |       if (route.request().method() === "GET" && successfulSaveStarted) {
  488 |         markSnapshotReadHeld?.();
  489 |         await snapshotReadReleased;
  490 |       }
  491 |       await route.continue();
  492 |     };
  493 |     await host.route("**/rest/v1/cash_outs*", holdSnapshotAfterSuccessfulSave);
  494 |     await cashOut.focus();
  495 |     await cashOut.blur();
  496 |     await expect(host.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  497 |     await expect(cashOut).toHaveValue("0");
  498 |     await snapshotReadHeld;
  499 |     // The acknowledged write can precede the snapshot update. A no-edit blur
  500 |     // must retain the acknowledged draft while that read is still delayed.
  501 |     await cashOut.focus();
  502 |     await cashOut.blur();
  503 |     await expect(cashOut).toHaveValue("0");
  504 |     releaseSnapshotRead?.();
  505 |     // Let held handlers finish before unregistering them; otherwise unroute
  506 |     // can handle a released request before its own continuation resumes.
  507 |     await host.unrouteAll({ behavior: "wait" });
  508 |   } finally {
  509 |     await hostContext.close();
  510 |   }
  511 | });
  512 | 
  513 | test("holds a multi-user settlement until cash-outs reconcile", async ({ browser }) => {
  514 |   test.slow();
  515 |   const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
  516 |   const hostContext = await createDeviceContext(browser, mobile);
  517 |   const guestContext = await createDeviceContext(browser, mobile);
  518 |   const host = await hostContext.newPage();
  519 |   const guest = await guestContext.newPage();
  520 | 
  521 |   try {
  522 |     await createGame(host, "Realtime test game");
  523 |     await joinGame(guest, host.url(), "Jordan");
  524 |     await expectAutomaticOpeningBuyIn(guest);
  525 |     await expect(host.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
  526 |     await host.getByRole("button", { name: "Approve", exact: true }).click();
  527 | 
  528 |     await host.getByRole("button", { name: "End game" }).click();
  529 |     await host.getByRole("button", { name: "Start cash-outs" }).click();
> 530 |     await expect(guest.getByRole("heading", { name: "Cash-outs", exact: true })).toBeVisible();
      |                                                                                  ^ Error: expect(locator).toBeVisible() failed
  531 |     await expect(guest.getByRole("heading", { name: "Your cash-out", exact: true })).toBeVisible();
  532 |     await expect(guest.getByRole("heading", { name: "Table cash-outs", exact: true })).toBeVisible();
  533 |     await expect(guest.locator('ul[aria-label="Table cash-outs"]').getByRole("textbox")).toHaveCount(0);
  534 | 
  535 |     await host.getByRole("spinbutton", { name: "Cash-out amount for Casey" }).fill("20");
  536 |     await host.getByRole("spinbutton", { name: "Cash-out amount for Casey" }).blur();
  537 |     await guest.getByRole("textbox", { name: "Cash-out amount for Jordan" }).fill("10");
  538 |     await guest.getByRole("textbox", { name: "Cash-out amount for Jordan" }).blur();
  539 | 
  540 |     await expect(host.getByText(/\$[\d,.]+ (short in|extra in) cash-outs/)).toBeVisible();
  541 |     await expect(host.getByRole("button", { name: /^Resolve .* difference$/ })).toBeEnabled();
  542 | 
  543 |     await host.getByRole("spinbutton", { name: "Cash-out amount for Casey" }).fill("30");
  544 |     await host.getByRole("spinbutton", { name: "Cash-out amount for Casey" }).blur();
  545 |     await expect(host.getByText("Bank reconciled", { exact: true })).toBeVisible();
  546 |     await expect(host.getByRole("button", { name: "Review settlement" })).toBeEnabled();
  547 | 
  548 |     await guest.getByRole("textbox", { name: "Cash-out amount for Jordan" }).fill("20");
  549 |     await guest.getByRole("textbox", { name: "Cash-out amount for Jordan" }).blur();
  550 |     await expect(host.getByRole("spinbutton", { name: "Cash-out amount for Jordan" })).toHaveValue("20");
  551 |     await expect(host.getByText(/\$[\d,.]+ (short in|extra in) cash-outs/)).toBeVisible();
  552 | 
  553 |     await guest.getByRole("textbox", { name: "Cash-out amount for Jordan" }).fill("10");
  554 |     await guest.getByRole("textbox", { name: "Cash-out amount for Jordan" }).blur();
  555 |     await expect(guest.getByText("Saved", { exact: true })).toBeVisible();
  556 |     await expect(host.getByRole("spinbutton", { name: "Cash-out amount for Jordan" })).toHaveValue("10", {
  557 |       timeout: 15_000,
  558 |     });
  559 |     await expect(host.getByText("Bank reconciled", { exact: true })).toBeVisible();
  560 | 
  561 |     await host.getByRole("button", { name: "Review settlement" }).click();
  562 | 
  563 |     const hostPlan = host.locator('[data-testid="full-settlement-plan"]');
  564 |     await expect(hostPlan).toHaveJSProperty("open", false);
  565 |     await expect(host.getByRole("region", { name: "Ready to settle?" })).toBeVisible();
  566 |     await expect(host.getByRole("button", { name: "Mark sent" })).toHaveCount(0);
  567 | 
  568 |     await expect(guest.getByRole("button", { name: "Preview settlement" })).toHaveCount(0);
  569 |     await expect(guest.getByText("Cash-outs are in.", { exact: true })).toBeVisible();
  570 |     await expect(guest.getByText("Waiting for Casey to finalize the settlement. Payment instructions will appear once it's locked.")).toBeVisible();
  571 |     await expect(guest.getByRole("button", { name: "Mark sent" })).toHaveCount(0);
  572 | 
  573 |     await host.getByRole("button", { name: "Lock settlement" }).click();
  574 |     await host.getByRole("alertdialog").getByRole("button", { name: "Lock settlement" }).click();
  575 |     const hostSettlement = host.getByRole("region", { name: "$10.00 coming to you." });
  576 |     await expect(hostSettlement).toBeVisible();
  577 |     await expect(hostSettlement.getByText("Payments coming to you", { exact: true })).toBeVisible();
  578 |     await expect(hostSettlement.getByRole("listitem")).toContainText("From Jordan");
  579 |     const guestSettlement = guest.getByRole("region", { name: "You owe $10.00." });
  580 |     await expect(guestSettlement).toBeVisible();
  581 |     await expect(guestSettlement.getByRole("listitem")).toContainText("Casey");
  582 |     await expect(guest.locator('[data-testid="full-settlement-plan"]')).toHaveCount(0);
  583 |     const guestLedger = guest.locator('[data-testid="payment-ledger"]');
  584 |     await expect(guestLedger.locator(":scope > summary")).toContainText("0 of 1 payment marked sent");
  585 |     await guestLedger.locator(":scope > summary").click();
  586 |     await expect(guestLedger.getByRole("listitem")).toContainText("Jordan → Casey");
  587 |     const markSent = guest.getByRole("checkbox", { name: /^Mark sent:/ }).first();
  588 |     const markSentControl = guest.getByTitle("Mark sent").first();
  589 |     const [paymentWrite] = await Promise.all([
  590 |       guest.waitForResponse((response) =>
  591 |         response.url().includes("/rest/v1/rpc/set_settlement_payment_status_guarded"),
  592 |         { timeout: 15_000 },
  593 |       ),
  594 |       markSentControl.click(),
  595 |     ]);
  596 |     expect(paymentWrite.ok()).toBe(true);
  597 |     await expect(markSent).toBeChecked();
  598 |     await expect(guest.getByText("Payment marked sent", { exact: true })).toBeVisible();
  599 |     await expect(guest.getByRole("heading", { name: "All your payments are marked sent." })).toBeVisible();
  600 |     await expect(host.getByRole("heading", { name: "All payments to you are marked sent." })).toBeVisible();
  601 |     await expect(guestLedger.locator(":scope > summary")).toContainText("1 of 1 payment marked sent", { timeout: 15_000 });
  602 |     await expect(host.locator('[data-testid="payment-ledger"] > summary')).toContainText("1 of 1 payment marked sent", { timeout: 15_000 });
  603 |     await expect(hostPlan).toContainText("1/1 marked sent", { timeout: 15_000 });
  604 |   } finally {
  605 |     await guestContext.close();
  606 |     await hostContext.close();
  607 |   }
  608 | });
  609 | 
  610 | test("runs a whole table with host-added players", async ({ page }) => {
  611 |   test.slow();
  612 |   await runHostPlayerFlow(page);
  613 | });
  614 | 
  615 | test("syncs host-added players to guests without exposing host controls", async ({ browser }) => {
  616 |   const hostContext = await createDeviceContext(browser);
  617 |   const guestContext = await createDeviceContext(browser);
  618 |   const host = await hostContext.newPage();
  619 |   const guest = await guestContext.newPage();
  620 |   try {
  621 |     await createGame(host, "Realtime test game");
  622 |     await joinGame(guest, host.url(), "Jordan");
  623 |     await host.getByRole("button", { name: "Add player", exact: true }).click();
  624 |     const add = host.getByRole("dialog", { name: "Add a player" });
  625 |     await add.getByRole("textbox", { name: "Player name" }).fill("Taylor");
  626 |     await add.getByRole("button", { name: "Add player", exact: true }).click();
  627 |     await expect(playerCard(guest, "Taylor")).toContainText("$20.00");
  628 |     await expect(playerCard(guest, "Taylor")).toContainText("Host-managed");
  629 |     await expect(guest.getByRole("button", { name: "Add player", exact: true })).toHaveCount(0);
  630 |     await expect(guest.getByRole("button", { name: /Manage Taylor/ })).toHaveCount(0);
```