# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: realtime.spec.ts >> restores an account-owned seat and settled history across browsers
- Location: tests/e2e/realtime.spec.ts:643:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'End game', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('button', { name: 'End game', exact: true })
    - waiting for "http://127.0.0.1:3110/game/R7TV86" navigation to finish...

```

```yaml
- link "Skip to content":
  - /url: "#main-content"
- banner:
  - link "Mainpot home":
    - /url: /
    - text: Mainpot
  - navigation "Main navigation":
    - link "Dashboard":
      - /url: /dashboard
    - link "Friends":
      - /url: /friends
    - button "Sign out"
- main:
  - paragraph: Host a table
  - heading "Start a game." [level=1]
  - paragraph: Set the buy-in, then invite your table with a code.
  - paragraph: Guests can keep two unfinished tables open. Resume or finish one before starting another, or sign in for more history.
  - form "Game details":
    - text: Your name
    - textbox "Your name":
      - /placeholder: Mike
      - text: Casey
    - text: Game name
    - textbox "Game name":
      - /placeholder: Friday Night at Mike's
      - text: Recovery regression
    - text: Buy-in amount
    - textbox "Buy-in amount":
      - /placeholder: "20"
      - text: "20"
    - paragraph: This game settles wins and losses at the end. If buy-ins have already been paid into a cash pot, its payouts are different from these net payments.
    - checkbox "Add my opening buy-in" [checked]
    - text: Add my opening buy-in
    - paragraph: Your opening buy-in of $20.00 will be recorded when you create the game.
    - checkbox "Save these details as a recurring game"
    - text: Save these details as a recurring game
    - button "Create game" [disabled]
- status
- alert
```

# Test source

```ts
  1   | import { expect, type Page, type Browser } from "@playwright/test";
  2   | import { createDeviceContext } from "./device-context";
  3   | 
  4   | export async function checkCalculatorValidation(page: Page) {
  5   |   await page.goto("/poker-settlement-calculator");
  6   |   await page.getByRole("button", { name: "Clear example" }).click();
  7   |   const amount = page.getByLabel("Money in for player 1", { exact: true });
  8   |   const result = page.locator("#calculator-results");
  9   |   for (const invalid of ["-20", "0.001", "Infinity", "1e2", "100000000"]) {
  10  |     await amount.fill(invalid);
  11  |     await expect(amount).toHaveAttribute("aria-invalid", "true");
  12  |     await expect(result).toContainText("Correct the highlighted amounts");
  13  |     await expect(result).not.toContainText("Bank balanced");
  14  |     await expect(result).not.toContainText("No payments needed");
  15  |   }
  16  |   await amount.fill("20");
  17  |   await page.getByLabel("Final stack for player 1", { exact: true }).fill("20");
  18  |   await page.getByLabel("Money in for player 2", { exact: true }).fill("0");
  19  |   await page.getByLabel("Final stack for player 2", { exact: true }).fill("0");
  20  |   await expect(amount).toHaveAttribute("aria-invalid", "false");
  21  |   await expect(result).toContainText("Bank balanced");
  22  | }
  23  | 
  24  | export async function checkAccountRecovery(browser: Browser, baseURL: string) {
  25  |   const first = await createDeviceContext(browser, { baseURL, reducedMotion: "reduce" });
  26  |   const second = await createDeviceContext(browser, { baseURL, reducedMotion: "reduce" });
  27  |   const host = await first.newPage();
  28  |   const resumed = await second.newPage();
  29  |   const email = `recovery-${crypto.randomUUID()}@example.com`;
  30  |   const password = `Recovery-${crypto.randomUUID()}`;
  31  |   try {
  32  |     await host.goto("/signin");
  33  |     await host.getByRole("button", { name: "Create an account", exact: true }).click();
  34  |     await host.getByLabel("Display name", { exact: true }).fill("Casey");
  35  |     await host.getByLabel("Email", { exact: true }).fill(email);
  36  |     await host.getByLabel("Password", { exact: true }).fill(password);
  37  |     await host.getByRole("button", { name: "Create account", exact: true }).click();
  38  |     await expect(host).toHaveURL(/dashboard/);
  39  |     await host.goto("/create");
  40  |     await host.locator("#create-name").fill("Casey");
  41  |     await expect(host.locator("#create-name")).toHaveValue("Casey");
  42  |     await host.locator("#create-game-name").fill("Recovery regression");
  43  |     await expect(host.locator("#create-game-name")).toHaveValue("Recovery regression");
  44  |     await host.locator("#create-buy-in").fill("20");
  45  |     await expect(host.locator("#create-buy-in")).toHaveValue("20");
  46  |     await expect(host.locator("#create-game-name")).toHaveValue("Recovery regression");
  47  |     await host.getByRole("button", { name: "Create game", exact: true }).click();
> 48  |     await expect(host.getByRole("button", { name: "End game", exact: true })).toBeVisible();
      |                                                                               ^ Error: expect(locator).toBeVisible() failed
  49  |     const gameUrl = host.url();
  50  |     await resumed.goto("/signin");
  51  |     await resumed.getByLabel("Email", { exact: true }).fill(email);
  52  |     await resumed.getByLabel("Password", { exact: true }).fill(password);
  53  |     await resumed.getByRole("button", { name: "Sign in", exact: true }).click();
  54  |     await expect(resumed).toHaveURL(/dashboard/);
  55  |     const unfinished = resumed.getByRole("region", { name: "Your unfinished games" });
  56  |     await expect(unfinished).toContainText("Recovery regression");
  57  |     expect(await resumed.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(resumed.viewportSize()!.width);
  58  |     await resumed.screenshot({ path: `docs/audits/2026-09-26/evidence/dashboard-resume-${resumed.viewportSize()!.width}.png`, fullPage: true });
  59  |     await unfinished.getByRole("button", { name: "Resume game" }).click();
  60  |     await expect(resumed).toHaveURL(gameUrl);
  61  |     await expect(resumed.getByRole("button", { name: "End game", exact: true })).toBeVisible();
  62  |     await expect(resumed.locator("#join-prompt-name")).toHaveCount(0);
  63  |     // The recovered host can mutate and remains the same seat in the first browser.
  64  |     await resumed.getByRole("button", { name: "End game", exact: true }).click();
  65  |     await resumed.getByRole("button", { name: "Start cash-outs" }).click();
  66  |     const cashout = resumed.getByRole("spinbutton", { name: "Cash-out amount for Casey" });
  67  |     await cashout.fill("20");
  68  |     await cashout.blur();
  69  |     await expect(host.getByText("Bank reconciled", { exact: true })).toBeVisible();
  70  |     await resumed.getByRole("button", { name: "Review settlement" }).click();
  71  |     await resumed.getByRole("button", { name: "Lock settlement", exact: true }).click();
  72  |     await resumed.getByRole("alertdialog").getByRole("button", { name: "Lock settlement" }).click();
  73  |     await expect(resumed.getByRole("heading", { name: "You're even.", exact: true })).toBeVisible();
  74  |     await resumed.goto("/dashboard");
  75  |     await expect(resumed.getByRole("region", { name: "Your unfinished games" })).toHaveCount(0);
  76  |     // An optional endpoint failure must not hide history or the user's profile.
  77  |     await resumed.route("**/rest/v1/account_deletion_requests**", route => route.fulfill({
  78  |       status: 400, contentType: "application/json", body: JSON.stringify({ message: "Injected optional section failure" }),
  79  |     }));
  80  |     await resumed.reload();
  81  |     await expect(resumed.getByText("Some dashboard sections are unavailable")).toBeVisible();
  82  |     await expect(resumed.getByRole("heading", { name: "Casey", exact: true })).toBeVisible();
  83  |     await expect(resumed.getByText("No final results yet", { exact: true })).toHaveCount(0);
  84  |     await expect(resumed.getByRole("button", { name: "Request account deletion", exact: true })).toHaveCount(0);
  85  |     await resumed.unroute("**/rest/v1/account_deletion_requests**");
  86  |     await resumed.getByRole("button", { name: "Retry dashboard" }).click();
  87  |     await expect(resumed.getByText("Some dashboard sections are unavailable")).toHaveCount(0);
  88  |     await resumed.getByRole("link", { name: "Recovery regression", exact: true }).click();
  89  |     await expect(resumed.getByRole("heading", { name: "You're even.", exact: true })).toBeVisible();
  90  |     await expect(resumed.getByRole("button", { name: "End game", exact: true })).toHaveCount(0);
  91  |     await resumed.goto("/dashboard");
  92  |     await resumed.getByText("Account data and deletion", { exact: true }).click();
  93  |     await resumed.getByRole("button", { name: "Request account deletion", exact: true }).click();
  94  |     await resumed.getByRole("alertdialog").getByRole("button", { name: "Request deletion", exact: true }).click();
  95  |     await expect(resumed.getByText(/Your deletion request is/)).toContainText("pending");
  96  |     await resumed.reload();
  97  |     await resumed.getByText("Account data and deletion", { exact: true }).click();
  98  |     await expect(resumed.getByText(/Your deletion request is/)).toContainText("pending");
  99  |     await expect(resumed.getByRole("button", { name: "Request account deletion", exact: true })).toHaveCount(0);
  100 |     await expect(resumed.getByRole("button", { name: "Export my data" })).toBeEnabled();
  101 |   } finally {
  102 |     await first.close();
  103 |     await second.close();
  104 |   }
  105 | }
  106 | 
  107 | export async function checkSavedFriendInvitation(browser: Browser, baseURL: string) {
  108 |   const contexts = await Promise.all([createDeviceContext(browser, { baseURL }), createDeviceContext(browser, { baseURL })]);
  109 |   const [host, friend] = await Promise.all(contexts.map(context => context.newPage()));
  110 |   const names = [`Host ${Date.now()}`, `Friend ${Date.now()}`];
  111 |   try {
  112 |     for (const [index, page] of [host, friend].entries()) {
  113 |       await page.goto("/signin");
  114 |       await page.getByRole("button", { name: "Create an account", exact: true }).click();
  115 |       await page.getByLabel("Display name", { exact: true }).fill(names[index]);
  116 |       await page.getByLabel("Email", { exact: true }).fill(`invite-${crypto.randomUUID()}@example.com`);
  117 |       await page.getByLabel("Password", { exact: true }).fill(`Invite-${crypto.randomUUID()}`);
  118 |       await page.getByRole("button", { name: "Create account", exact: true }).click();
  119 |       await expect(page).toHaveURL(/dashboard/);
  120 |     }
  121 |     await host.goto("/friends");
  122 |     await host.getByRole("textbox", { name: "Find a player" }).fill(names[1]);
  123 |     await host.getByRole("button", { name: "Search", exact: true }).click();
  124 |     await host.getByRole("button", { name: "Add", exact: true }).click();
  125 |     await expect(host.getByText("Sent requests · 1", { exact: true })).toBeVisible();
  126 |     await friend.goto("/friends");
  127 |     await friend.getByRole("button", { name: "Accept", exact: true }).click();
  128 |     await expect(friend.getByText("Friends · 1", { exact: true })).toBeVisible();
  129 |     await host.goto("/create");
  130 |     await host.locator("#create-name").fill(names[0]);
  131 |     await host.locator("#create-game-name").fill("Invited game regression");
  132 |     await host.locator("#create-buy-in").fill("20");
  133 |     await host.getByRole("button", { name: "Create game", exact: true }).click();
  134 |     let releaseFriends!: () => void;
  135 |     const friendsGate = new Promise<void>((resolve) => { releaseFriends = resolve; });
  136 |     await host.route("**/rest/v1/friendships**", async route => {
  137 |       await friendsGate;
  138 |       await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "Injected friend-list failure" }) });
  139 |     });
  140 |     await host.getByRole("button", { name: "Invite players", exact: true }).click();
  141 |     const inviteDialog = host.getByRole("dialog");
  142 |     try {
  143 |       await expect(inviteDialog.getByRole("status")).toContainText("Loading saved friends");
  144 |       await expect(inviteDialog.getByText("Add friends", { exact: true })).toHaveCount(0);
  145 |     } finally { releaseFriends(); }
  146 |     await expect(inviteDialog.getByRole("alert")).toContainText("Saved friends could not load.");
  147 |     await host.unroute("**/rest/v1/friendships**");
  148 |     await inviteDialog.getByRole("button", { name: "Retry friends", exact: true }).click();
```