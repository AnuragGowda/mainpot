import { chromium, webkit, devices, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { checkPwaRecovery } from "../tests/e2e/pwa-flow.ts";

// This pass creates disposable local-storage tables. Never point it at a
// hosted deployment: provider/device/real-host acceptance is a separate gate.
const baseURL = process.env.MAINPOT_AUDIT_BASE_URL || "http://127.0.0.1:3125";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname)) {
  throw new Error("UI acceptance requires a local server built without Supabase configuration.");
}
const output = resolve(process.env.MAINPOT_AUDIT_OUTPUT || "docs/audits/2026-10-03/follow-up/evidence");
await mkdir(output, { recursive: true });
const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const rows = [];
const profiles = [
  ["desktop-chrome", chromium, devices["Desktop Chrome"]],
  ["narrow-chrome", chromium, { viewport: { width: 320, height: 568 } }],
  ["android-chrome", chromium, devices["Pixel 5"]],
  ["iphone-webkit", webkit, devices["iPhone 13"]],
  ["iphone-landscape-webkit", webkit, { ...devices["iPhone 13"], viewport: { width: 844, height: 390 } }],
  ["desktop-webkit", webkit, { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } }],
];
const requestedProfiles = process.env.MAINPOT_AUDIT_PROFILES?.split(",").map(name => name.trim());
if (requestedProfiles?.some(name => !profiles.some(([profile]) => profile === name))) {
  throw new Error("MAINPOT_AUDIT_PROFILES must name known browser profiles.");
}
const persist = () => writeFile(`${output}/browser-checks.json`, JSON.stringify(rows, null, 2));

for (const [profile, engine, options] of profiles) {
  if (requestedProfiles && !requestedProfiles.includes(profile)) continue;
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({ ...options, baseURL, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  let supportLinkCheck = null;
  page.on("pageerror", error => errors.push(error.message));
  const scan = async (state, { screenshot = false, fontScale = 1 } = {}) => {
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${scale * 100}%`; }, fontScale);
    // Evaluate the settled screen, rather than an entry animation's partial
    // opacity. Infinite decorative animations must not block the scan.
    await page.evaluate(() => Promise.allSettled(document.getAnimations()
      .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
      .map(animation => animation.finished)));
    await page.addScriptTag({ path: axePath });
    const result = await page.evaluate(async () => {
      const axeResult = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
      });
      const ledgerText = [...document.querySelectorAll("header p.text-lg, #player-list li > div:last-child > p, #player-list li > div:nth-child(2) > div > p, #panel-min li p.font-semibold, #panel-bank li p.font-semibold")];
      const clippedLedgerText = ledgerText.flatMap((node, index) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const bounds = range.getBoundingClientRect();
        let clipped = node.scrollWidth > node.clientWidth + 1;
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
          if (!["hidden", "clip"].includes(getComputedStyle(parent).overflowX)) continue;
          const container = parent.getBoundingClientRect();
          if (bounds.left < container.left - 1 || bounds.right > container.right + 1) clipped = true;
        }
        return clipped ? [{ index, className: node.className }] : [];
      });
      return {
        width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
        rootFont: getComputedStyle(document.documentElement).fontSize,
        clippedLedgerText,
        overflowingTextContainers: document.documentElement.scrollWidth > innerWidth
          ? [...document.querySelectorAll("body *")]
            .filter(node => node.clientWidth && node.scrollWidth > node.clientWidth + 1)
            .map(node => ({ tag: node.tagName, className: String(node.className),
              clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }))
          : [],
        overflowingElements: [...document.querySelectorAll("body *")]
          .map(node => ({ node, bounds: node.getBoundingClientRect() }))
          .filter(({ bounds }) => bounds.width && (bounds.right > innerWidth + 1 || bounds.left < -1))
          .slice(0, 30).map(({ node, bounds }) => ({ tag: node.tagName, className: String(node.className),
            left: Math.round(bounds.left), right: Math.round(bounds.right) })),
        violations: axeResult.violations.map(item => ({ id: item.id, impact: item.impact,
          nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })),
        incomplete: axeResult.incomplete.map(item => ({ id: item.id, nodes: item.nodes.length,
          details: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })),
      };
    });
    rows.push({ profile, state, path: new URL(page.url()).pathname, fontScale, supportLinkCheck, ...result, errors: [...errors] });
    await persist();
    if (screenshot) await page.screenshot({ path: `${output}/${profile}-${state}.png`, fullPage: state === "nine-seat-200-percent-font" || state.startsWith("expanded-settlement-plan") });
    if (screenshot && state === "nine-seat-200-percent-font") {
      await page.screenshot({ path: `${output}/${profile}-${state}-viewport.png` });
    }
    expect(result.scrollWidth, `${profile}/${state}: horizontal reflow`).toBeLessThanOrEqual(result.width);
    expect(result.clippedLedgerText, `${profile}/${state}: readable ledger names and amounts`).toEqual([]);
    expect(result.violations, `${profile}/${state}: axe violations`).toEqual([]);
    expect(errors, `${profile}/${state}: uncaught errors`).toEqual([]);
  };
  try {
    // Check that this server is really local-storage mode before creating data.
    await page.goto("/signin", { waitUntil: "networkidle" });
    await expect(page.getByText("Accounts are off in local mode", { exact: true })).toBeVisible();
    for (const path of ["/", "/create", "/join", "/signin", "/poker-settlement-calculator", "/feedback", "/self-host", "/privacy", "/terms", "/missing-branding-page", "/offline.html", "/recover.html"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      const footer = page.getByRole("navigation", { name: "Footer navigation" });
      supportLinkCheck = "no-footer";
      if (await footer.count()) {
        const support = footer.getByRole("link", { name: "Support Mainpot (opens in a new tab)" });
        const expectedURL = process.env.MAINPOT_EXPECT_SUPPORT_URL;
        supportLinkCheck = expectedURL ? "pending" : "not-requested";
        if (expectedURL) {
          await expect(support).toHaveAttribute("href", new URL(expectedURL).href);
          await expect(support).toHaveAttribute("rel", "noopener noreferrer");
          await support.focus();
          await expect(support).toBeFocused();
          supportLinkCheck = "passed";
        }
      }
      // Focusing the footer link scrolls it into view. Public-page captures
      // should show the first screen, where the copy establishes the task.
      await page.evaluate(() => window.scrollTo(0, 0));
      await scan(path === "/" ? "landing" : path.slice(1), { screenshot: path === "/" || profile === "narrow-chrome" });
    }
    supportLinkCheck = null;
    await page.goto("/create");
    await expect(page.locator("#create-name")).toBeEnabled();
    // Navigate the complete basic setup form with the keyboard.
    for (let count = 0; count < 20 && !(await page.locator("#create-name").evaluate(node => node === document.activeElement)); count += 1) {
      await page.keyboard.press("Tab");
    }
    await expect(page.locator("#create-name")).toBeFocused();
    await page.keyboard.type("Casey");
    await page.keyboard.press("Tab");
    await expect(page.locator("#create-game-name")).toBeFocused();
    await page.keyboard.type("Acceptance busy table");
    await page.keyboard.press("Tab");
    await expect(page.locator("#create-buy-in")).toBeFocused();
    await page.keyboard.type("20");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("checkbox", { name: "Add my opening buy-in" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Create game", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Acceptance busy table", exact: true })).toBeVisible();
    const names = ["Jordan", "Taylor", "Morgan", "Avery", "Riley", "Quinn", "Sam", "Alex"];
    const table = page.getByRole("region", { name: "At the table" });
    for (const name of names) {
      await table.getByRole("button", { name: "Add player", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Add a player" });
      await dialog.getByRole("textbox", { name: "Player name" }).fill(name);
      await dialog.getByRole("textbox", { name: "Opening buy-in" }).fill("20");
      await dialog.getByRole("button", { name: "Add player", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
    await expect(table.getByRole("listitem")).toHaveCount(9);
    await scan("nine-seat-active", { screenshot: true });
    const manage = page.getByRole("button", { name: "Manage Jordan", exact: true });
    await manage.click();
    const dialog = page.getByRole("dialog", { name: "Manage Jordan" });
    await expect(dialog).toBeVisible();
    await scan("manage-player-200-percent-font", { fontScale: 2, screenshot: true });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(manage).toBeFocused();
    await scan("nine-seat-200-percent-font", { fontScale: 2, screenshot: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
    await page.getByRole("button", { name: "End game", exact: true }).click();
    await page.getByRole("button", { name: "Start cash-outs" }).click();
    for (const name of ["Casey", ...names]) {
      const amount = page.getByRole("spinbutton", { name: `Cash-out amount for ${name}` });
      await amount.fill(name === "Casey" ? "180" : "0");
      await amount.blur();
    }
    await expect(page.getByText("Totals match", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Review settlement", exact: true }).click();
    await scan("nine-seat-settlement-review", { screenshot: true });
    const fullPlan = page.locator('[data-testid="full-settlement-plan"]');
    await fullPlan.locator(":scope > summary").click();
    await scan("expanded-settlement-plan", { screenshot: profile === "narrow-chrome" });
    await scan("expanded-settlement-plan-200-percent-font", { fontScale: 2, screenshot: profile === "narrow-chrome" });
    await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
    await fullPlan.locator(":scope > summary").click();
    await page.getByRole("button", { name: "Lock settlement", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Lock settlement", exact: true }).click();
    await expect(page.getByText("Ended", { exact: true })).toBeVisible();
    await scan("nine-seat-locked", { screenshot: true });
    await page.goto("/create");
    await page.locator("#create-name").fill("Casey");
    await page.locator("#create-game-name").fill("Maximum amount acceptance");
    await page.locator("#create-buy-in").fill("99999999.99");
    await page.getByRole("button", { name: /^(Create game|Start another game)$/ }).click();
    await expect(page.getByRole("region", { name: "At the table" }).getByText("$99,999,999.99", { exact: true })).toBeVisible();
    await scan("maximum-valid-amount", { screenshot: true });
    await scan("maximum-valid-amount-200-percent-font", { fontScale: 2, screenshot: true });
    if (engine === chromium && profile === "desktop-chrome") {
      const pwaContext = await browser.newContext({ ...options, baseURL, serviceWorkers: "allow" });
      try {
        await checkPwaRecovery(await pwaContext.newPage(), `${output}/${profile}-pwa`);
        rows.push({ profile, state: "service-worker-offline-recovery", passed: true, physicalDevice: false });
        await persist();
      } finally { await pwaContext.close(); }
    }
    console.log(`${profile}: public screens, keyboard setup, nine-seat settlement, text scaling and focus passed.`);
  } catch (error) {
    rows.push({ profile, failure: error.message });
    await persist();
    throw error;
  } finally { await browser.close(); }
}
console.log(`UI acceptance passed; ${rows.length} receipts in ${output}. Emulation and font scaling do not establish physical-device, native zoom or screen-reader acceptance.`);
