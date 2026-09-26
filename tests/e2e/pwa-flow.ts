import { expect, type Page } from "@playwright/test";

export async function checkPwaRecovery(page: Page, evidencePrefix: string) {
  await page.goto("/create");
  await page.locator("#create-name").fill("Casey");
  await page.locator("#create-game-name").fill("PWA recovery table");
  await page.locator("#create-buy-in").fill("20");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await expect(page.getByRole("heading", { name: "PWA recovery table" })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>(resolve => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
  });
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === "maskable")).toBe(true);
  const caches = await page.evaluate(async () => {
    const keys = await window.caches.keys();
    return Promise.all(keys.map(async key => (await (await window.caches.open(key)).keys()).map(request => new URL(request.url).pathname)));
  });
  expect(caches.flat().every(path => path === "/offline.html" || /\.(png)$/.test(path))).toBe(true);

  const url = page.url();
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again" })).toHaveAttribute("href", new URL(url).pathname);
  await page.screenshot({ path: `${evidencePrefix}-offline.png`, fullPage: true });
  await page.context().setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("heading", { name: "PWA recovery table" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a rebuy" })).toBeEnabled();
  await page.screenshot({ path: `${evidencePrefix}-recovered.png`, fullPage: true });
}
