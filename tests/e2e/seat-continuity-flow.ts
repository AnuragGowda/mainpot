import { expect, test, type Browser, type Page } from "@playwright/test";
import { createDeviceContext } from "./device-context";

function playerList(page: Page) {
  return page.getByRole("region", { name: "At the table" }).getByRole("listitem");
}

function playerCard(page: Page, name: string) {
  return playerList(page).filter({ hasText: name });
}

function pot(page: Page) {
  return page.getByText("Pot", { exact: true }).locator("..");
}

async function createGame(host: Page) {
  await host.goto("/create");
  await host.locator("#create-name").fill("Casey");
  await host.locator("#create-game-name").fill("Seat continuity");
  await host.locator("#create-buy-in").fill("20");
  await host.getByRole("button", { name: "Create game", exact: true }).click();
  await expect(host.getByRole("heading", { name: "Seat continuity" })).toBeVisible({ timeout: 15_000 });
}

/**
 * Covers a phone-free seat being claimed, leaving, and restored without
 * changing its financial history. Call from a database-backed Playwright spec.
 */
export async function runSeatContinuityFlow(browser: Browser, baseURL: string) {
  const contexts = await Promise.all([
    createDeviceContext(browser, { baseURL, reducedMotion: "reduce" }),
    createDeviceContext(browser, { baseURL, reducedMotion: "reduce" }),
  ]);
  const [host, guest] = await Promise.all(contexts.map((context) => context.newPage()));

  const runtimeErrors: string[] = [];
  for (const page of [host, guest]) page.on("pageerror", error => runtimeErrors.push(error.message));

  try {
    await createGame(host);
    const table = host.getByRole("region", { name: "At the table" });
    await table.getByRole("button", { name: "Add player", exact: true }).click();
    const addPlayer = host.getByRole("dialog", { name: "Add a player" });
    await addPlayer.getByRole("textbox", { name: "Player name" }).fill("Jordan");
    await addPlayer.getByRole("textbox", { name: "Opening buy-in" }).fill("20");
    await addPlayer.getByRole("button", { name: "Add player", exact: true }).click();
    await expect(addPlayer).toHaveCount(0);

    const jordanOnHost = playerCard(host, "Jordan");
    await expect(jordanOnHost).toContainText("Host-managed");
    await expect(jordanOnHost).toContainText("$20.00");
    await expect(playerList(host)).toHaveCount(2);
    await expect(pot(host)).toContainText("$40.00");

    await jordanOnHost.getByRole("button", { name: "Manage Jordan", exact: true }).click();
    const manageJordan = host.getByRole("dialog", { name: "Manage Jordan" });
    await manageJordan.getByRole("button", { name: "Create seat link", exact: true }).click();
    const seatLinkInput = manageJordan.getByRole("textbox", { name: "Seat link", exact: true });
    await expect(seatLinkInput).toBeVisible();
    const seatLink = await seatLinkInput.inputValue();
    const seatLinkFragment = new URL(seatLink).hash;
    expect(seatLinkFragment.length).toBeGreaterThan(1);
    await manageJordan.getByRole("button", { name: "Close seat link", exact: true }).click();
    await expect(seatLinkInput).toHaveCount(0);
    await manageJordan.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(manageJordan).toHaveCount(0);

    await guest.goto(seatLink);
    await expect(guest.getByText("Your recorded seat is ready.", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(guest.locator("#join-prompt-name")).toHaveCount(0);
    await expect(playerList(guest)).toHaveCount(2);
    await expect(playerCard(guest, "Jordan")).toContainText("1 entry");
    await expect(playerCard(guest, "Jordan")).toContainText("$20.00");
    await expect(jordanOnHost).not.toContainText("Host-managed", { timeout: 15_000 });
    await expect(host.getByRole("region", { name: "Needs approval" })).toHaveCount(0);
    await expect(pot(host)).toContainText("$40.00");
    await host.screenshot({
      path: test.info().outputPath("seat-continuity-claimed.png"),
      fullPage: true,
    });

    await guest.getByRole("button", { name: "Cash out", exact: true }).click();
    const leaveDialog = guest.getByRole("alertdialog", { name: "Cash out & leave" });
    await leaveDialog.getByRole("button", { name: "Leave now and settle when the game ends", exact: true }).click();
    const settleLater = guest.getByRole("alertdialog", { name: "Leave without cashing out?" });
    await expect(settleLater).toBeVisible();
    await settleLater.getByRole("button", { name: "Leave & settle later", exact: true }).click();
    await expect(guest.getByText("You left this game. Ask Casey to return your existing seat to the table.", { exact: true })).toBeVisible({ timeout: 15_000 });

    await expect(jordanOnHost).toContainText("Left", { timeout: 15_000 });
    await jordanOnHost.getByRole("button", { name: "Return Jordan to table", exact: true }).click();
    await expect(playerCard(host, "Jordan")).not.toContainText("Left", { timeout: 15_000 });
    await expect(playerCard(host, "Jordan")).not.toContainText("Host-managed");
    await expect(playerCard(host, "Jordan")).toContainText("1 entry");
    await expect(playerCard(host, "Jordan")).toContainText("$20.00");
    await expect(playerList(host)).toHaveCount(2);
    await expect(host.getByRole("region", { name: "Needs approval" })).toHaveCount(0);
    await expect(pot(host)).toContainText("$40.00");

    await expect(guest.getByText("You left this game. Ask Casey to return your existing seat to the table.", { exact: true })).toHaveCount(0, { timeout: 15_000 });
    await expect(playerCard(guest, "Jordan")).toContainText("1 entry");
    await expect(guest.getByRole("button", { name: "Add a rebuy", exact: true })).toBeVisible();
    await expect(guest.getByRole("button", { name: "Cash out", exact: true })).toBeVisible();
    await host.screenshot({
      path: test.info().outputPath("seat-continuity-restored.png"),
      fullPage: true,
    });
    expect(runtimeErrors, "Independent devices must not leave uncaught browser errors").toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
}
