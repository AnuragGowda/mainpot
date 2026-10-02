import { expect, test, type Browser, type Page } from "@playwright/test";
import { createDeviceContext } from "./device-context";
import { writeFile } from "node:fs/promises";
import { failureDiagnostics } from "./failure-diagnostics";

function playerList(page: Page) {
  return page.getByRole("region", { name: "At the table" }).getByRole("listitem");
}

function pot(page: Page) {
  return page.getByText("Pot", { exact: true }).locator("..");
}

async function createGame(host: Page, gameName: string, hostName: string, navigate: ReturnType<typeof failureDiagnostics>["navigate"]) {
  await navigate(host, "host create navigation", () => host.goto("/create"));
  await host.waitForLoadState("networkidle");
  await host.locator("#create-name").fill(hostName);
  await host.locator("#create-game-name").fill(gameName);
  await host.locator("#create-buy-in").fill("20");
  await host.getByRole("button", { name: /^(Create game|Start another game)$/ }).click();
  await expect(host.getByRole("heading", { name: gameName })).toBeVisible({ timeout: 15_000 });
}

async function expectDuplicateJoin(page: Page, gameUrl: string, name: string, navigate: ReturnType<typeof failureDiagnostics>["navigate"]) {
  await navigate(page, "duplicate join navigation", () => page.goto(gameUrl));
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

  const diagnostics = failureDiagnostics([host, firstGuest, secondGuest]);
  await diagnostics.ready;
  const { runtimeErrors, setPhase, navigate } = diagnostics;

  try {
    await createGame(host, "Lobby name guards", "Casey", navigate);
    setPhase("duplicate name guards");
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

    await expectDuplicateJoin(firstGuest, guardedGameUrl, "  jordan  ", navigate);
    await expect(playerList(host)).toHaveCount(2);
    await expect(pot(host)).toContainText("$40.00");
    await expectDuplicateJoin(firstGuest, guardedGameUrl, "Ｊｏｒｄａｎ", navigate);
    await expectDuplicateJoin(firstGuest, guardedGameUrl, "Jor\u200bdan", navigate);
    await expect(playerList(host)).toHaveCount(2);
    await expect(pot(host)).toContainText("$40.00");

    const guestSession = await firstGuest.evaluate(() => localStorage.getItem("ante_session_id"));
    const hostSession = await host.evaluate(() => localStorage.getItem("ante_session_id"));
    await firstGuest.evaluate(session => localStorage.setItem("ante_session_id", session!), hostSession);
    await navigate(firstGuest, "guest session substitution reload", () => firstGuest.reload());
    setPhase("session substitution assertions");
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

    await createGame(host, "Lobby name race", "Morgan", navigate);
    const raceGameUrl = host.url();
    await Promise.all([
      navigate(firstGuest, "race guest navigation", () => firstGuest.goto(raceGameUrl)),
      navigate(secondGuest, "race guest navigation", () => secondGuest.goto(raceGameUrl)),
    ]);
    setPhase("concurrent name race");
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

    await navigate(winner, "winner reload", () => winner.reload());
    setPhase("winner reload assertions");
    await expect(winner.locator("#join-prompt-name")).toHaveCount(0, { timeout: 15_000 });
    await expect(playerList(winner)).toHaveCount(2);
    await expect(playerList(winner).filter({ hasText: /casey/i })).toContainText("1 entry");
    await expect(pending.getByRole("listitem")).toHaveCount(1);
    await host.screenshot({
      path: test.info().outputPath("lobby-name-guard-race.png"),
      fullPage: true,
    });
    if (runtimeErrors.length || diagnostics.report().retiredReads.length) await writeFile(test.info().outputPath("network-diagnostics.json"), JSON.stringify(diagnostics.report(), null, 2));
    expect(diagnostics.unhandledErrors(), "Independent devices must not leave uncaught browser errors").toEqual([]);
  } catch (error) {
    const report = JSON.stringify(diagnostics.report(), null, 2);
    console.error("WebKit failure diagnostics:", report);
    try { await writeFile(test.info().outputPath("network-diagnostics.json"), report); } catch { /* Preserve the original failure. */ }
    throw error;
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
}
