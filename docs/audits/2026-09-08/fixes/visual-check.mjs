import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const out = 'docs/audits/2026-09-08/fixes';
const results = [], errors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ baseURL: process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:3100', viewport: { width: 393, height: 852 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
page.on('pageerror', error => errors.push(error.message));
async function capture(name) {
  if (name.startsWith("recap-")) await page.waitForTimeout(3500);
  await page.addScriptTag({ path: require.resolve('axe-core') });
  const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ html: n.html, summary: n.failureSummary })) })));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await page.screenshot({ path: `${out}/${name}.png` });
  results.push({ name, violations, overflow });
  console.log(name, violations.map(v => v.id), { overflow });
}
try {
  for (const [name, path] of [['calculator', '/poker-settlement-calculator'], ['self-host', '/self-host'], ['join', '/join']]) {
    await page.goto(path);
    await capture(`${name}-393`);
  }
  await page.goto('/create');
  await page.locator('#create-name').fill('Casey');
  await page.locator('#create-game-name').fill('Audit fixes table');
  await page.locator('#create-buy-in').fill('0.001');
  await page.getByRole('button', { name: 'Create game', exact: true }).click();
  await capture('subcent-rejected');
  await page.locator('#create-buy-in').fill('20');
  await page.getByRole('button', { name: 'Create game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Audit fixes table', exact: true })).toBeVisible();
  await capture('active-game');
  await page.getByRole('button', { name: 'End game', exact: true }).click();
  await page.getByRole('button', { name: 'Start cash-outs', exact: true }).click();
  const cashout = page.getByRole('spinbutton', { name: 'Cash-out amount for Casey' });
  await cashout.fill('20'); await cashout.blur();
  await expect(page.getByText('Bank reconciled', { exact: true })).toBeVisible();
  await capture('cashout');
  await page.getByRole('button', { name: 'Review settlement', exact: true }).click();
  await page.getByRole('button', { name: 'Lock settlement', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Lock settlement', exact: true }).click();
  await capture('settled');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: 'Customize and share your game card', exact: true }).click();
  await capture('recap-public-320');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Names hidden · Amounts shown · Losses shown').last()).toBeInViewport();
  await dialog.getByRole('checkbox', { name: 'Show amounts and losses', exact: true }).uncheck();
  await expect(dialog.getByText('Names hidden · Amounts hidden · Losses hidden').last()).toBeInViewport();
  await capture('recap-private-320');
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Share game card', exact: true }).click();
  await (await download).saveAs(`${out}/recap-private-export.png`);
} finally {
  writeFileSync(`${out}/visual-check.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
