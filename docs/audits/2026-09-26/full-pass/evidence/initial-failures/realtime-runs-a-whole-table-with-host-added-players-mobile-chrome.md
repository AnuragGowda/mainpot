# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: realtime.spec.ts >> runs a whole table with host-added players
- Location: tests/e2e/realtime.spec.ts:610:5

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByRole('dialog', { name: 'Manage Jordan' })
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for getByRole('dialog', { name: 'Manage Jordan' })
    12 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [ref=f1e1]:
  - link "Skip to content" [ref=f1e2] [cursor=pointer]:
    - /url: "#main-content"
  - main [ref=f1e3]:
    - generic [ref=f1e4]:
      - generic [ref=f1e5]:
        - generic [ref=f1e6]:
          - generic [ref=f1e7]:
            - heading "Host-managed table" [level=1] [ref=f1e8]
            - generic [ref=f1e9]: Active
          - paragraph [ref=f1e10]: Hosted by Casey
        - generic [ref=f1e12]:
          - button "Invite players" [ref=f1e13]: Invite
          - button "End game" [ref=f1e20]
      - generic [ref=f1e21]:
        - generic [ref=f1e22]:
          - paragraph [ref=f1e23]: Buy-in
          - paragraph [ref=f1e24]: $20.00
        - generic [ref=f1e25]:
          - paragraph [ref=f1e26]: Pot
          - paragraph [ref=f1e27]: $45.50
        - generic [ref=f1e28]:
          - paragraph [ref=f1e29]: Players
          - paragraph [ref=f1e30]: "3"
    - generic [ref=f1e31]:
      - region [ref=f1e32]:
        - generic [ref=f1e33]:
          - generic [ref=f1e34]:
            - heading "At the table" [level=2] [ref=f1e35]
            - paragraph [ref=f1e36]: Host-confirmed entries by player.
          - button "Add player" [ref=f1e37]
        - list [ref=f1e42]:
          - listitem [ref=f1e43]:
            - generic [ref=f1e44]: CA
            - generic [ref=f1e45]:
              - generic [ref=f1e46]:
                - paragraph [ref=f1e47]: Casey
                - generic [ref=f1e48]: Host
                - generic [ref=f1e49]: You
              - paragraph [ref=f1e50]: 1 entry
            - paragraph [ref=f1e52]: $20.00
          - listitem [ref=f1e53]:
            - generic [ref=f1e54]: JO
            - generic [ref=f1e55]:
              - paragraph [ref=f1e57]: Jordan
              - paragraph [ref=f1e58]: 2 entries · Host-managed
            - generic [ref=f1e59]:
              - paragraph [ref=f1e60]: $25.50
              - button "Manage Jordan" [active] [ref=f1e61]: Manage
          - listitem [ref=f1e62]:
            - generic [ref=f1e63]: TA
            - generic [ref=f1e64]:
              - paragraph [ref=f1e66]: Taylor
              - paragraph [ref=f1e67]: 0 entries · Host-managed
            - generic [ref=f1e68]:
              - paragraph [ref=f1e69]: $0.00
              - button "Manage Taylor" [ref=f1e70]: Manage
      - region [ref=f1e71]:
        - generic [ref=f1e72]:
          - generic [ref=f1e73]:
            - heading "Activity" [level=2] [ref=f1e74]
            - paragraph [ref=f1e75]: Newest first.
          - generic [ref=f1e76]: 7 events
        - list [ref=f1e78]:
          - listitem [ref=f1e79]:
            - generic [ref=f1e80]:
              - generic [ref=f1e81]: $
              - generic [ref=f1e82]:
                - paragraph [ref=f1e83]: Jordan recorded a rebuy for $5.50
                - time [ref=f1e84]: 1:17 PM
              - button "Actions for Jordan recorded a rebuy for $5.50" [ref=f1e85]: ···
          - listitem [ref=f1e86]:
            - generic [ref=f1e87]:
              - generic [ref=f1e88]: +
              - generic [ref=f1e89]:
                - paragraph [ref=f1e90]: Casey added Taylor to the table
                - time [ref=f1e91]: 1:17 PM
              - button "Actions for Casey added Taylor to the table" [ref=f1e92]: ···
          - listitem [ref=f1e93]:
            - generic [ref=f1e94]:
              - generic [ref=f1e95]: $
              - generic [ref=f1e96]:
                - paragraph [ref=f1e97]: Jordan recorded a buy-in for $20.00
                - time [ref=f1e98]: 1:17 PM
              - button "Actions for Jordan recorded a buy-in for $20.00" [ref=f1e99]: ···
          - listitem [ref=f1e100]:
            - generic [ref=f1e101]:
              - generic [ref=f1e102]: +
              - generic [ref=f1e103]:
                - paragraph [ref=f1e104]: Casey added Jordan to the table
                - time [ref=f1e105]: 1:17 PM
              - button "Actions for Casey added Jordan to the table" [ref=f1e106]: ···
          - listitem [ref=f1e107]:
            - generic [ref=f1e108]:
              - generic [ref=f1e109]: $
              - generic [ref=f1e110]:
                - paragraph [ref=f1e111]: Casey recorded a buy-in for $20.00
                - time [ref=f1e112]: 1:17 PM
              - button "Actions for Casey recorded a buy-in for $20.00" [ref=f1e113]: ···
          - listitem [ref=f1e114]:
            - generic [ref=f1e115]:
              - generic [ref=f1e116]: +
              - generic [ref=f1e117]:
                - paragraph [ref=f1e118]: Casey joined
                - time [ref=f1e119]: 1:17 PM
          - listitem [ref=f1e120]:
            - generic [ref=f1e121]:
              - generic [ref=f1e122]: ✓
              - generic [ref=f1e123]:
                - paragraph [ref=f1e124]: Casey opened the table
                - time [ref=f1e125]: 1:17 PM
      - region [ref=f1e126]:
        - generic [ref=f1e127]:
          - group [ref=f1e128]:
            - generic "How did you hear about Mainpot? Optional · one tap" [ref=f1e129] [cursor=pointer]:
              - generic [ref=f1e130]: How did you hear about Mainpot?
              - generic [ref=f1e131]: Optional · one tap
          - button "Dismiss acquisition question" [ref=f1e132]
    - generic [ref=f1e139]:
      - button "Add a rebuy" [ref=f1e140]
      - button "Leave" [disabled] [ref=f1e141]
  - status:
    - generic: Table updated
  - alert [ref=f1e142]
```

# Test source

```ts
  1  | import { expect, type Page } from "@playwright/test";
  2  | 
  3  | /** The same real UI journey runs with local storage and the disposable database. */
  4  | export async function runHostPlayerFlow(page: Page) {
  5  |   await page.goto("/create");
  6  |   await page.locator("#create-name").fill("Casey");
  7  |   await page.locator("#create-game-name").fill("Host-managed table");
  8  |   await page.locator("#create-buy-in").fill("20");
  9  |   await page.getByRole("button", { name: "Create game" }).click();
  10 |   await expect(page.getByRole("heading", { name: "Host-managed table" })).toBeVisible();
  11 |   const hostSession = await page.evaluate(() => localStorage.getItem("ante_session_id"));
  12 |   const table = page.getByRole("region", { name: "At the table" });
  13 |   const jordan = table.getByRole("listitem").filter({ hasText: "Jordan" });
  14 |   const taylor = table.getByRole("listitem").filter({ hasText: "Taylor" });
  15 | 
  16 |   for (const [name, amount] of [["Jordan", "20"], ["Taylor", "0"]]) {
  17 |     await table.getByRole("button", { name: "Add player", exact: true }).click();
  18 |     const dialog = page.getByRole("dialog", { name: "Add a player" });
  19 |     await expect(dialog.getByRole("textbox", { name: "Player name" })).toBeFocused();
  20 |     await dialog.getByRole("textbox", { name: "Player name" }).fill(name);
  21 |     await dialog.getByRole("textbox", { name: "Opening buy-in" }).fill(amount);
  22 |     await dialog.getByRole("button", { name: "Add player", exact: true }).click();
  23 |     await expect(dialog).toHaveCount(0);
  24 |     await expect(table.getByRole("listitem").filter({ hasText: name })).toContainText("Host-managed");
  25 |   }
  26 |   await expect(jordan).toContainText("$20.00");
  27 |   await expect(taylor).toContainText("0 entries");
  28 |   expect(await page.evaluate(() => localStorage.getItem("ante_session_id"))).toBe(hostSession);
  29 |   await expect(page.getByRole("button", { name: "Leave", exact: true })).toBeDisabled();
  30 | 
  31 |   await jordan.getByRole("button", { name: "Manage Jordan" }).click();
  32 |   const jordanForm = page.getByRole("dialog", { name: "Manage Jordan" });
  33 |   await jordanForm.getByRole("textbox", { name: "Buy-in amount" }).fill("5.50");
  34 |   await jordanForm.getByRole("button", { name: "Record buy-in" }).click();
> 35 |   await expect(jordanForm).toHaveCount(0);
     |                            ^ Error: expect(locator).toHaveCount(expected) failed
  36 |   await expect(jordan).toContainText("$25.50");
  37 |   await expect(jordan).toContainText("2 entries");
  38 |   await expect(page.getByRole("region", { name: "Needs approval" })).toHaveCount(0);
  39 | 
  40 |   await taylor.getByRole("button", { name: "Manage Taylor" }).click();
  41 |   const taylorForm = page.getByRole("dialog", { name: "Manage Taylor" });
  42 |   await taylorForm.getByRole("textbox", { name: "Buy-in amount" }).fill("10");
  43 |   await taylorForm.getByRole("button", { name: "Record buy-in" }).click();
  44 |   await expect(taylorForm).toHaveCount(0);
  45 |   await expect(taylor).toContainText("$10.00");
  46 |   await page.reload();
  47 |   await expect(table.getByRole("listitem")).toHaveCount(3);
  48 |   await expect(jordan).toContainText("$25.50");
  49 | 
  50 |   // The host can cash out a phone-free player while the other seats stay active.
  51 |   await taylor.getByRole("button", { name: "Manage Taylor" }).click();
  52 |   await taylorForm.getByRole("button", { name: "Cash-out", exact: true }).click();
  53 |   await taylorForm.getByRole("textbox", { name: "Final stack" }).fill("5");
  54 |   await taylorForm.getByRole("button", { name: "Review cash-out" }).click();
  55 |   await expect(taylorForm).toHaveCount(0);
  56 |   const early = page.getByRole("region", { name: "Early cash-outs" });
  57 |   await expect(early).toContainText("Taylor");
  58 |   await early.getByRole("button", { name: "Confirm & lock" }).click();
  59 |   await expect(taylor).toContainText("Cashed out");
  60 |   await expect(taylor.getByRole("button", { name: "Manage Taylor" })).toHaveCount(0);
  61 | 
  62 |   await page.getByRole("button", { name: "End game", exact: true }).click();
  63 |   await page.getByRole("button", { name: "Start cash-outs" }).click();
  64 |   await page.getByRole("spinbutton", { name: "Cash-out amount for Casey" }).fill("30");
  65 |   await page.getByRole("spinbutton", { name: "Cash-out amount for Casey" }).blur();
  66 |   await page.getByRole("spinbutton", { name: "Cash-out amount for Jordan" }).fill("20.50");
  67 |   await page.getByRole("spinbutton", { name: "Cash-out amount for Jordan" }).blur();
  68 |   await expect(page.getByText("Bank reconciled", { exact: true })).toBeVisible();
  69 |   await page.getByRole("button", { name: "Review settlement" }).click();
  70 |   await page.getByRole("button", { name: "Lock settlement", exact: true }).click();
  71 |   await page.getByRole("alertdialog").getByRole("button", { name: "Lock settlement", exact: true }).click();
  72 |   await expect(page.getByText("Ended", { exact: true })).toBeVisible();
  73 |   await expect(page.getByRole("button", { name: "Reveal your game card" })).toBeVisible();
  74 |   await expect(page.getByRole("button", { name: "Add player", exact: true })).toHaveCount(0);
  75 | }
  76 | 
```