# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: realtime.spec.ts >> ends an expired guest recovery window without trapping the signed-in account
- Location: tests/e2e/realtime.spec.ts:665:5

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('alert').filter({ hasText: 'Your guest-game recovery window expired.' })
Expected substring: "Your guest-game recovery window expired."
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for getByRole('alert').filter({ hasText: 'Your guest-game recovery window expired.' })

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
  - paragraph: Your poker ledger
  - heading "Expired Casey" [level=1]
  - paragraph: Add a username so friends can find you
  - button "Edit profile"
  - link "New game":
    - /url: /create
  - heading "Start your first table" [level=2]
  - paragraph: Create a game, then add your regulars when they join.
  - link "New game":
    - /url: /create
  - link "Find friends":
    - /url: /friends
  - group: Account data and deletion
- status
- alert
```

# Test source

```ts
  1  | import { expect, type Browser } from "@playwright/test";
  2  | import { createDeviceContext } from "./device-context";
  3  | 
  4  | /** Preserve an authenticated guest host's table when creating an account. */
  5  | export async function runGuestAccountTransfer(browser: Browser, baseURL: string) {
  6  |   const original = await createDeviceContext(browser, { baseURL });
  7  |   const fresh = await createDeviceContext(browser, { baseURL });
  8  |   const host = await original.newPage();
  9  |   const resumed = await fresh.newPage();
  10 |   const email = `guest-transfer-${crypto.randomUUID()}@example.com`;
  11 |   const password = `Transfer-${crypto.randomUUID()}`;
  12 |   try {
  13 |     await host.goto("/create");
  14 |     await host.locator("#create-name").fill("Guest Casey");
  15 |     await host.locator("#create-game-name").fill("Guest account recovery");
  16 |     await host.locator("#create-buy-in").fill("20");
  17 |     await host.getByRole("button", { name: "Create game", exact: true }).click();
  18 |     await expect(host.getByRole("heading", { name: "Guest account recovery" })).toBeVisible();
  19 |     const gameUrl = host.url();
  20 |     await host.goto("/signin");
  21 |     await host.getByRole("button", { name: "Create an account", exact: true }).click();
  22 |     await host.getByLabel("Display name", { exact: true }).fill("Guest Casey");
  23 |     await host.getByLabel("Email", { exact: true }).fill(email);
  24 |     await host.getByLabel("Password", { exact: true }).fill(password);
  25 |     await host.getByRole("button", { name: "Create account", exact: true }).click();
  26 |     await expect(host).toHaveURL(/dashboard/);
  27 |     await expect(host.getByRole("region", { name: "Your unfinished games" })).toContainText("Guest account recovery");
  28 |     await resumed.goto("/signin");
  29 |     await resumed.getByLabel("Email", { exact: true }).fill(email);
  30 |     await resumed.getByLabel("Password", { exact: true }).fill(password);
  31 |     await resumed.getByRole("button", { name: "Sign in", exact: true }).click();
  32 |     await expect(resumed).toHaveURL(/dashboard/);
  33 |     await resumed.getByRole("region", { name: "Your unfinished games" }).getByRole("button", { name: "Resume game" }).click();
  34 |     await expect(resumed).toHaveURL(gameUrl);
  35 |     await expect(resumed.locator("#join-prompt-name")).toHaveCount(0);
  36 |     await expect(resumed.getByRole("button", { name: "End game", exact: true })).toBeEnabled();
  37 |     await resumed.getByRole("button", { name: "Add a rebuy" }).click();
  38 |     await resumed.getByRole("spinbutton", { name: "Rebuy amount" }).fill("5");
  39 |     await resumed.getByRole("button", { name: "Add rebuy", exact: true }).click();
  40 |     await expect(resumed.getByRole("region", { name: "Needs approval" })).toHaveCount(0);
  41 |     await expect(resumed.getByText("Pot", { exact: true }).locator("..")).toContainText("$25.00");
  42 |   } finally {
  43 |     await original.close();
  44 |     await fresh.close();
  45 |   }
  46 | }
  47 | 
  48 | /** An expired recovery proof must leave the new account usable without a retry loop. */
  49 | export async function runExpiredGuestRecoveryWindowFlow(browser: Browser, baseURL: string) {
  50 |   const context = await createDeviceContext(browser, { baseURL });
  51 |   const page = await context.newPage();
  52 |   const email = `expired-guest-transfer-${crypto.randomUUID()}@example.com`;
  53 |   const password = `Expired-${crypto.randomUUID()}`;
  54 |   try {
  55 |     await page.goto("/signin");
  56 |     await page.getByRole("button", { name: "Create an account", exact: true }).click();
  57 |     await page.getByLabel("Display name", { exact: true }).fill("Expired Casey");
  58 |     await page.getByLabel("Email", { exact: true }).fill(email);
  59 |     await page.getByLabel("Password", { exact: true }).fill(password);
  60 |     await page.getByRole("button", { name: "Create account", exact: true }).click();
  61 |     await expect(page).toHaveURL(/dashboard/);
  62 | 
  63 |     await page.evaluate(() => window.sessionStorage.setItem("mainpot_account_transfer", "0".repeat(64)));
  64 |     await page.goto("/signin?next=%2Fdashboard&account_recovery=failed");
  65 |     await expect(page.getByText("Retry recovery from the same browser where you played as a guest.")).toBeVisible();
  66 |     await page.getByRole("button", { name: "Retry guest recovery" }).click();
  67 |     await expect(page.getByRole("heading", { name: "You're signed in" })).toBeVisible();
> 68 |     await expect(page.getByRole("alert").filter({ hasText: "Your guest-game recovery window expired." })).toContainText("Your guest-game recovery window expired.");
     |                                                                                                           ^ Error: expect(locator).toContainText(expected) failed
  69 |     await expect(page.getByText("Guest games can only be recovered within one hour after requesting the confirmation email, from the same browser.")).toBeVisible();
  70 |     await expect(page.getByRole("button", { name: "Retry guest recovery" })).toHaveCount(0);
  71 |     await expect(page.getByText("Retry recovery from the same browser where you played as a guest.")).toHaveCount(0);
  72 |     await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("mainpot_account_transfer"))).toBeNull();
  73 |     await page.getByRole("button", { name: "Continue to your account" }).click();
  74 |     await expect(page).toHaveURL(/dashboard/);
  75 |   } finally {
  76 |     await context.close();
  77 |   }
  78 | }
  79 | 
```