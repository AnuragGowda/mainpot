import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const out = 'docs/audits/2026-09-08/fixes';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ baseURL: 'http://127.0.0.1:3100', viewport: { width: 320, height: 568 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
const payer = 'Jordan With A Very Long Lastname';
const results = [];
try {
  await page.goto('/create');
  await page.locator('#create-name').fill('Casey');
  await page.locator('#create-game-name').fill('Readable payments');
  await page.locator('#create-buy-in').fill('20');
  await page.getByRole('button', { name: 'Create game', exact: true }).click();
  await page.getByRole('button', { name: 'Add player', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add a player' });
  await add.getByRole('textbox', { name: 'Player name' }).fill(payer);
  await add.getByRole('button', { name: 'Add player', exact: true }).click();
  await page.getByRole('button', { name: 'End game', exact: true }).click();
  await page.getByRole('button', { name: 'Start cash-outs', exact: true }).click();
  for (const [name, value] of [['Casey', '30'], [payer, '10']]) {
    const input = page.getByRole('spinbutton', { name: `Cash-out amount for ${name}`, exact: true });
    await input.fill(value); await input.blur();
  }
  await expect(page.getByText('Bank reconciled', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review settlement', exact: true }).click();
  await page.getByRole('button', { name: 'Lock settlement', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Lock settlement', exact: true }).click();
  const personal = page.getByRole('region', { name: '$10.00 coming to you.' });
  await expect(personal).toContainText(`From ${payer}`);
  await page.waitForTimeout(3500);
  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 852 });
    await personal.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/incoming-${width}.png` });
    await page.addScriptTag({ path: require.resolve('axe-core') });
    const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map(v => v.id));
    results.push({ width, name: await personal.getByRole('listitem').innerText(), overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), violations });
  }
} finally {
  writeFileSync(`${out}/incoming-layout.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
