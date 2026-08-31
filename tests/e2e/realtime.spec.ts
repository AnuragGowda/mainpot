import { expect, test } from "@playwright/test";

test("syncs a guest join, buy-in, and host approval between two users", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await host.goto("/create");
    await host.locator("#create-name").fill("Casey");
    await host.locator("#create-game-name").fill("Realtime test game");
    await host.locator("#create-buy-in").fill("20");
    await host.getByRole("button", { name: "Create game" }).click();
    await expect(host).toHaveURL(/\/game\/[A-HJ-NP-Z2-9]{6}$/);

    await guest.goto(host.url());
    await expect(guest.getByRole("heading", { name: "Join this game" })).toBeVisible();
    await guest.locator("#join-prompt-name").fill("Jordan");
    await guest.getByRole("button", { name: "Join", exact: true }).click();
    await expect(guest.getByRole("heading", { name: "Realtime test game" })).toBeVisible();
    const hostTable = host.locator("section").filter({ has: host.getByRole("heading", { name: "At the table" }) });
    await expect(hostTable.getByRole("listitem").filter({ hasText: "Jordan" })).toBeVisible();

    await guest.getByRole("button", { name: "Buy in · $20.00" }).click();
    await expect(host.getByRole("button", { name: "Approve" })).toBeVisible();
    await host.getByRole("button", { name: "Approve" }).click();
    await expect(host.getByRole("region", { name: "Needs approval" })).toHaveCount(0);
    const guestTable = guest.locator("section").filter({ has: guest.getByRole("heading", { name: "At the table" }) });
    await expect(guestTable.getByRole("listitem").filter({ hasText: "Jordan" }).getByText("1 entry", { exact: true })).toBeVisible();
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
