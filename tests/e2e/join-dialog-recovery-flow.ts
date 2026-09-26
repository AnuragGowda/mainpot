import { expect, type Browser } from "@playwright/test";

/**
 * Checks the short-viewport direct-link join dialog and its safe exit paths
 * without submitting a join request or creating a second seat.
 */
export async function runJoinDialogRecoveryFlow(browser: Browser, baseURL: string) {
  const context = await browser.newContext({
    viewport: { width: 568, height: 320 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();

  try {
    await page.goto(new URL("/create", baseURL).toString());
    await page.locator("#create-name").fill("Casey");
    await page.locator("#create-game-name").fill("Short-screen table");
    await page.locator("#create-buy-in").fill("20");
    await page.getByRole("button", { name: "Create game" }).click();
    await expect(page).toHaveURL(/\/game\/[A-Z0-9]+$/);
    const code = page.url().split("/").at(-1)!;
    const hostSession = await page.evaluate(() => localStorage.getItem("ante_session_id"));
    expect(hostSession).toBeTruthy();

    await page.evaluate(() => localStorage.setItem("ante_session_id", crypto.randomUUID()));
    await page.reload();
    const dialog = page.getByRole("dialog", { name: "Short-screen table" });
    await expect(dialog).toBeVisible();
    await page.locator("#join-prompt-name").fill("Jordan");

    for (const viewport of [{ width: 568, height: 320 }, { width: 320, height: 300 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
      await dialog.evaluate((element) => element.scrollTo({ top: 0 }));
      await expect(page.getByRole("heading", { name: "Short-screen table" })).toBeInViewport();
      await page.getByText("Buy-in", { exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByText("$20.00", { exact: true })).toBeInViewport();
      await page.getByText("Joining records this opening buy-in for the host to review.").scrollIntoViewIfNeeded();
      await expect(page.getByRole("button", { name: "Join", exact: true })).toBeInViewport();

      if (viewport.width === 568) {
        await page.keyboard.press("Escape");
        await expect(page).toHaveURL(/\/join$/);
        await expect(page.locator("#join-name")).toHaveValue("Jordan");
        await page.goto(new URL(`/game/${code}`, baseURL).toString());
        await expect(dialog).toBeVisible();
      }
    }

    await page.getByRole("link", { name: "Back to join" }).click();
    await expect(page).toHaveURL(/\/join$/);
    await expect(page.locator("#join-name")).toHaveValue("Jordan");
    await page.goto(new URL(`/game/${code}`, baseURL).toString());
    await expect(dialog).toBeVisible();
    const accountLink = page.getByRole("link", { name: "Sign in to an existing account" });
    await expect(accountLink).toHaveAttribute("href", `/signin?next=${encodeURIComponent(`/game/${code}`)}`);
    await accountLink.click();
    await expect(page).toHaveURL(new URL(`/signin?next=${encodeURIComponent(`/game/${code}`)}`, baseURL).toString());

    await page.evaluate((sessionId) => localStorage.setItem("ante_session_id", sessionId!), hostSession);
    await page.goto(new URL(`/game/${code}`, baseURL).toString());
    const table = page.locator("section[aria-labelledby='table-heading']");
    await expect(table.getByRole("listitem")).toHaveCount(1);
    await expect(table).toContainText("Casey");
  } finally {
    await context.close();
  }
}
