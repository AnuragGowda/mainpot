import { expect, test, type Browser, type Page } from "@playwright/test";
import { createDeviceContext } from "./device-context";

function playerList(page: Page) {
  return page.getByRole("region", { name: "At the table" }).getByRole("listitem");
}

function pot(page: Page) {
  return page.getByText("Pot", { exact: true }).locator("..");
}

async function createGame(host: Page, gameName: string, hostName: string) {
  await host.waitForLoadState("networkidle");
  await host.goto("/create");
  await host.waitForLoadState("networkidle");
  await host.locator("#create-name").fill(hostName);
  await host.locator("#create-game-name").fill(gameName);
  await host.locator("#create-buy-in").fill("20");
  await host.getByRole("button", { name: /^(Create game|Start another game)$/ }).click();
  await expect(host.getByRole("heading", { name: gameName })).toBeVisible({ timeout: 15_000 });
}

async function expectDuplicateJoin(page: Page, gameUrl: string, name: string) {
  await page.waitForLoadState("networkidle");
  await page.goto(gameUrl);
  const input = page.locator("#join-prompt-name");
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill(name);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(/already used at this table/i);
  await expect(input).toBeVisible();
}

/**
 * Exercises the UI against the database name guard with three independent
 * browser identities. Call from an existing database-backed Playwright spec.
 */
export async function runLobbyNameGuardFlow(browser: Browser, baseURL: string) {
  const contexts = await Promise.all([
    createDeviceContext(browser, { baseURL, reducedMotion: "reduce" }),
    createDeviceContext(browser, { baseURL, reducedMotion: "reduce" }),
    createDeviceContext(browser, { baseURL, reducedMotion: "reduce" }),
  ]);
  const [host, firstGuest, secondGuest] = await Promise.all(contexts.map((context) => context.newPage()));

  const runtimeErrors: string[] = [];
  for (const page of [host, firstGuest, secondGuest]) page.on("pageerror", error => runtimeErrors.push(error.message));

  try {
    await createGame(host, "Lobby name guards", "Casey");
    const guardedGameUrl = host.url();
    const table = host.getByRole("region", { name: "At the table" });

    await table.getByRole("button", { name: "Add player", exact: true }).click();
    const addPlayer = host.getByRole("dialog", { name: "Add a player" });
    await addPlayer.getByRole("textbox", { name: "Player name" }).fill("Jordan");
    await addPlayer.getByRole("textbox", { name: "Opening buy-in" }).fill("20");
    await addPlayer.getByRole("button", { name: "Add player", exact: true }).click();
    await expect(addPlayer).toHaveCount(0);
    await expect(playerList(host)).toHaveCount(2);
    await expect(pot(host)).toContainText("$40.00");

    await expectDuplicateJoin(firstGuest, guardedGameUrl, "  jordan  ");
    await expect(playerList(host)).toHaveCount(2);
    await expect(pot(host)).toContainText("$40.00");
    await expectDuplicateJoin(firstGuest, guardedGameUrl, "Ｊｏｒｄａｎ");
    await expectDuplicateJoin(firstGuest, guardedGameUrl, "Jor\u200bdan");
    await expect(playerList(host)).toHaveCount(2);
    await expect(pot(host)).toContainText("$40.00");

    const guestSession = await firstGuest.evaluate(() => localStorage.getItem("ante_session_id"));
    const hostSession = await host.evaluate(() => localStorage.getItem("ante_session_id"));
    await firstGuest.evaluate(session => localStorage.setItem("ante_session_id", session!), hostSession);
    await firstGuest.waitForLoadState("networkidle");
    await firstGuest.reload();
    await expect(firstGuest.locator("#join-prompt-name")).toBeVisible();
    await expect(firstGuest.getByRole("button", { name: "End game", exact: true })).toHaveCount(0);
    await firstGuest.evaluate(session => localStorage.setItem("ante_session_id", session!), guestSession);

    await table.getByRole("button", { name: "Add player", exact: true }).click();
    await addPlayer.getByRole("textbox", { name: "Player name" }).fill("CASEY");
    await addPlayer.getByRole("button", { name: "Add player", exact: true }).click();
    await expect(addPlayer.getByRole("alert")).toContainText(/already used at this table/i);
    await expect(playerList(host)).toHaveCount(2);
    await expect(pot(host)).toContainText("$40.00");
    await host.screenshot({
      path: test.info().outputPath("lobby-name-guard-rejections.png"),
      fullPage: true,
    });

    await createGame(host, "Lobby name race", "Morgan");
    const raceGameUrl = host.url();
    await Promise.all([firstGuest.waitForLoadState("networkidle"), secondGuest.waitForLoadState("networkidle")]);
    await Promise.all([firstGuest.goto(raceGameUrl), secondGuest.goto(raceGameUrl)]);
    await Promise.all([
      expect(firstGuest.locator("#join-prompt-name")).toBeVisible({ timeout: 15_000 }),
      expect(secondGuest.locator("#join-prompt-name")).toBeVisible({ timeout: 15_000 }),
    ]);
    await firstGuest.locator("#join-prompt-name").fill("Casey");
    await secondGuest.locator("#join-prompt-name").fill("  cAsEy  ");
    await Promise.all([
      firstGuest.getByRole("button", { name: "Join", exact: true }).click(),
      secondGuest.getByRole("button", { name: "Join", exact: true }).click(),
    ]);

    await expect.poll(async () => {
      const prompts = await Promise.all([
        firstGuest.locator("#join-prompt-name").count(),
        secondGuest.locator("#join-prompt-name").count(),
      ]);
      return prompts.filter((count) => count === 0).length;
    }, { timeout: 15_000 }).toBe(1);

    const [firstPromptCount] = await Promise.all([
      firstGuest.locator("#join-prompt-name").count(),
      secondGuest.locator("#join-prompt-name").count(),
    ]);
    const winner = firstPromptCount === 0 ? firstGuest : secondGuest;
    const rejected = firstPromptCount === 0 ? secondGuest : firstGuest;
    await expect(rejected.getByRole("dialog").getByRole("alert")).toContainText(/already used at this table/i);

    const pending = host.getByRole("region", { name: "Needs approval" });
    await expect(pending.getByRole("listitem")).toHaveCount(1, { timeout: 15_000 });
    await expect(pending).toContainText(/casey/i);
    await expect(playerList(host)).toHaveCount(2);
    await expect(pot(host)).toContainText("$20.00");
    await expect(pot(host)).toContainText("(+$20.00)");

    await winner.waitForLoadState("networkidle");
    await winner.reload();
    await expect(winner.locator("#join-prompt-name")).toHaveCount(0, { timeout: 15_000 });
    await expect(playerList(winner)).toHaveCount(2);
    await expect(playerList(winner).filter({ hasText: /casey/i })).toContainText("1 entry");
    await expect(pending.getByRole("listitem")).toHaveCount(1);
    await host.screenshot({
      path: test.info().outputPath("lobby-name-guard-race.png"),
      fullPage: true,
    });
    expect(runtimeErrors, "Independent devices must not leave uncaught browser errors").toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
}
