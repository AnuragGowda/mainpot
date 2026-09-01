import { expect, test } from "@playwright/test";

// Local guest creation is deliberately rate-limited, so these database-backed
// scenarios run one at a time while each scenario still uses separate users.
test.describe.configure({ mode: "serial" });

async function createGame(host: import("@playwright/test").Page, name: string) {
  await host.goto("/create");
  await host.locator("#create-name").fill("Casey");
  await host.locator("#create-game-name").fill(name);
  await host.locator("#create-buy-in").fill("20");
  await host.getByRole("button", { name: "Create game" }).click();
  await expect(host).toHaveURL(/\/game\/[A-HJ-NP-Z2-9]{6}$/);
}

async function joinGame(page: import("@playwright/test").Page, gameUrl: string, name: string) {
  await page.goto(gameUrl);
  await expect(page.getByRole("heading", { name: "Join this game" })).toBeVisible();
  await page.locator("#join-prompt-name").fill(name);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Realtime test game" })).toBeVisible();
}

function playerCard(page: import("@playwright/test").Page, name: string) {
  return page
    .getByRole("region", { name: "At the table" })
    .getByRole("listitem")
    .filter({ hasText: name });
}

test("syncs two guests' independent ledger entries and host approval", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const jordanContext = await browser.newContext();
  const taylorContext = await browser.newContext();
  const host = await hostContext.newPage();
  const jordan = await jordanContext.newPage();
  const taylor = await taylorContext.newPage();

  try {
    await createGame(host, "Realtime test game");

    await joinGame(jordan, host.url(), "Jordan");
    await joinGame(taylor, host.url(), "Taylor");
    await expect(playerCard(host, "Jordan")).toBeVisible();
    await expect(playerCard(host, "Taylor")).toBeVisible();

    await jordan.getByRole("button", { name: "Buy in · $20.00" }).click();
    await taylor.getByRole("button", { name: "Buy in · $20.00" }).click();
    const pending = host.getByRole("region", { name: "Needs approval" });
    await expect(pending.getByRole("listitem")).toHaveCount(2);

    await pending.getByRole("button", { name: "Approve" }).first().click();
    await expect(pending.getByRole("listitem")).toHaveCount(1);
    await pending.getByRole("button", { name: "Approve" }).click();
    await expect(host.getByRole("region", { name: "Needs approval" })).toHaveCount(0);
    await expect(playerCard(host, "Jordan").getByText("1 entry", { exact: true })).toBeVisible();
    await expect(playerCard(host, "Taylor").getByText("1 entry", { exact: true })).toBeVisible();
  } finally {
    await taylorContext.close();
    await jordanContext.close();
    await hostContext.close();
  }
});

test("records only one ledger entry after a rapid duplicate buy-in", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await createGame(host, "Realtime test game");
    await joinGame(guest, host.url(), "Jordan");

    await guest.getByRole("button", { name: "Buy in · $20.00" }).dblclick();
    const pending = host.getByRole("region", { name: "Needs approval" });
    await expect(pending.getByRole("listitem")).toHaveCount(1);

    await pending.getByRole("button", { name: "Approve" }).click();
    await expect(host.getByRole("region", { name: "Needs approval" })).toHaveCount(0);
    await expect(playerCard(host, "Jordan").getByText("1 entry", { exact: true })).toBeVisible();
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});

test("transfers host authority and updates controls for both users", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const jordanContext = await browser.newContext();
  const host = await hostContext.newPage();
  const jordan = await jordanContext.newPage();

  try {
    await createGame(host, "Realtime test game");
    await joinGame(jordan, host.url(), "Jordan");

    await expect(host.getByRole("button", { name: "End game" })).toBeVisible();
    await expect(host.getByLabel("Pass host controls")).toBeVisible();

    await host.locator("#next-host").selectOption({ label: "Jordan" });
    await host.getByRole("button", { name: "Make host" }).click();

    await expect(host.getByRole("button", { name: "End game" })).toHaveCount(0);
    await expect(host.getByLabel("Pass host controls")).toHaveCount(0);
    await expect(jordan.getByRole("button", { name: "End game" })).toBeVisible();
    await expect(jordan.getByLabel("Pass host controls")).toBeVisible();
    await expect(playerCard(jordan, "Jordan").getByText("Host", { exact: true })).toBeVisible();
    await expect(playerCard(jordan, "Casey").getByText("Host", { exact: true })).toHaveCount(0);
  } finally {
    await jordanContext.close();
    await hostContext.close();
  }
});

test("keeps concurrent host correction and approval decisions auditable", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const jordanContext = await browser.newContext();
  const taylorContext = await browser.newContext();
  const host = await hostContext.newPage();
  const jordan = await jordanContext.newPage();
  const taylor = await taylorContext.newPage();

  try {
    await createGame(host, "Realtime test game");
    await joinGame(jordan, host.url(), "Jordan");
    await joinGame(taylor, host.url(), "Taylor");

    await jordan.getByRole("button", { name: "Buy in · $20.00" }).click();
    await taylor.getByRole("button", { name: "Buy in · $20.00" }).click();
    const pending = host.getByRole("region", { name: "Needs approval" });
    await expect(pending.getByRole("listitem")).toHaveCount(2);

    const jordanPending = pending.getByRole("listitem").filter({ hasText: "Jordan" });
    const taylorPending = pending.getByRole("listitem").filter({ hasText: "Taylor" });
    await jordanPending.getByRole("button", { name: "Edit Jordan buy-in" }).click();
    await jordanPending.getByLabel("Correct amount").fill("25");

    await Promise.all([
      jordanPending.getByRole("button", { name: "Save" }).click(),
      taylorPending.getByRole("button", { name: "Approve" }).click(),
    ]);

    await expect(pending.getByRole("listitem")).toHaveCount(1);
    await expect(pending.getByRole("listitem").filter({ hasText: "Jordan" })).toContainText("$25.00");
    await expect(playerCard(host, "Taylor").getByText("1 entry", { exact: true })).toBeVisible();
    await expect(playerCard(host, "Jordan")).toContainText("$25.00");
    await expect(host.getByText("edited Jordan’s buy-in", { exact: false })).toBeVisible();
  } finally {
    await taylorContext.close();
    await jordanContext.close();
    await hostContext.close();
  }
});

test("holds a multi-user settlement until cash-outs reconcile", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await createGame(host, "Realtime test game");
    await joinGame(guest, host.url(), "Jordan");
    await guest.getByRole("button", { name: "Buy in · $20.00" }).click();
    await expect(host.getByRole("button", { name: "Approve" })).toBeVisible();
    await host.getByRole("button", { name: "Approve" }).click();

    await host.getByRole("button", { name: "End game" }).click();
    await host.getByRole("button", { name: "Confirm?" }).click();
    await expect(guest.getByRole("heading", { name: "Cash-outs" })).toBeVisible();

    await host.getByRole("spinbutton", { name: "Cash-out amount for Casey" }).fill("20");
    await host.getByRole("spinbutton", { name: "Cash-out amount for Casey" }).blur();
    await guest.getByRole("spinbutton", { name: "Cash-out amount for Jordan" }).fill("10");
    await guest.getByRole("spinbutton", { name: "Cash-out amount for Jordan" }).blur();

    await expect(host.getByText("Cash-outs don't match buy-ins", { exact: true })).toBeVisible();
    await expect(host.getByRole("button", { name: "Calculate settlement" })).toBeDisabled();

    await host.getByRole("spinbutton", { name: "Cash-out amount for Casey" }).fill("30");
    await host.getByRole("spinbutton", { name: "Cash-out amount for Casey" }).blur();
    await expect(host.getByText("Bank reconciled", { exact: true })).toBeVisible();
    await expect(host.getByRole("button", { name: "Calculate settlement" })).toBeEnabled();

    await guest.getByRole("spinbutton", { name: "Cash-out amount for Jordan" }).fill("20");
    await guest.getByRole("spinbutton", { name: "Cash-out amount for Jordan" }).blur();
    await expect(host.getByRole("spinbutton", { name: "Cash-out amount for Jordan" })).toHaveValue("20");
    await expect(host.getByText("Cash-outs don't match buy-ins", { exact: true })).toBeVisible();

    await guest.getByRole("spinbutton", { name: "Cash-out amount for Jordan" }).fill("10");
    await guest.getByRole("spinbutton", { name: "Cash-out amount for Jordan" }).blur();
    await expect(host.getByRole("spinbutton", { name: "Cash-out amount for Jordan" })).toHaveValue("10");
    await expect(host.getByText("Bank reconciled", { exact: true })).toBeVisible();

    await host.getByRole("button", { name: "Calculate settlement" }).click();
    await expect(host.getByRole("tab", { name: "Fewest payments" })).toHaveAttribute("aria-selected", "true");
    await expect(host.getByRole("tabpanel")).toBeVisible();
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
