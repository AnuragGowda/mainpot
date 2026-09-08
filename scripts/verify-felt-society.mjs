import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const output = new URL('../test-results/recap-assignment-reveal/', import.meta.url).pathname;
const url = process.env.RECAP_LAB_URL ?? 'http://localhost:3211/recap-lab';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const report = { url, cards: [], viewports: [], behavior: [], consoleErrors: errors };
const svgSelector = 'svg[viewBox="0 0 1080 1920"]';
const labels = ['Positive finish', 'Negative finish', 'Break-even', 'Recorded rebuy', 'Long game', 'Private stats', 'Private alternate game', 'Unknown data', 'Hidden player', 'Hidden loss', 'Cent precision', 'Another positive finish'];
const titles = ['Mayor of Value Town', 'The Table Sponsor', 'The Break-Even Baron', 'The Encore Artist', 'The Felt Marathoner', 'The Table Celebrity', 'The Group Chat Correspondent'];

async function makePage(options = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', acceptDownloads: true, ...options });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    window.__exports = []; window.__shares = []; window.__shareMode = 'unsupported';
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      if (blob.type.startsWith('image/svg+xml')) blob.text().then(text => window.__exports.push(text));
      return create(blob);
    };
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => window.__shareMode !== 'unsupported' });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => {
      const bytes = new Uint8Array(await data.files[0].arrayBuffer());
      window.__shares.push({ title: data.title, text: data.text, type: data.files[0].type, dimensions: [new DataView(bytes.buffer).getUint32(16), new DataView(bytes.buffer).getUint32(20)] });
      if (window.__shareMode === 'abort') throw new DOMException('Cancelled', 'AbortError');
      if (window.__shareMode === 'error') throw new Error('Share unavailable');
    } });
  });
  return page;
}
async function choose(page, label) { await page.getByRole('combobox', { name: 'Example game', exact: true }).selectOption({ label }); }
async function finish(scope) { await expect(scope.locator('[data-recap-reveal]')).toHaveAttribute('data-recap-reveal', 'complete'); }
async function download(page, button, filename) {
  const downloading = page.waitForEvent('download'); await button.click();
  const file = await downloading; await file.saveAs(output + filename);
  const bytes = await readFile(output + filename);
  assert.equal(bytes.readUInt32BE(16), 2160); assert.equal(bytes.readUInt32BE(20), 3840);
  const source = await page.evaluate(() => window.__exports.at(-1));
  assert.match(source, /data:.*base64,/);
  assert(!/NEVER_RENDER|PAYMENTS|Skip reveal|Every night has a character/.test(source));
  assert(!/<animate|@keyframes/.test(source));
  await writeFile(output + filename.replace('.png', '.svg'), source);
  return source;
}
async function bounds(page, svg) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Horizontal page overflow');
  const outside = await svg.evaluate(el => {
    const outer = el.getBoundingClientRect();
    return [...el.querySelectorAll('text')].filter(t => {
      const box = t.getBoundingClientRect();
      return box.left < outer.left - 1 || box.right > outer.right + 1 || box.top < outer.top - 1 || box.bottom > outer.bottom + 1;
    }).map(t => t.textContent);
  });
  assert.deepEqual(outside, [], 'Text outside SVG');
}
async function openEditor(page) {
  await page.getByRole('button', { name: 'Preview game editor', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close game recap' })).toBeFocused();
  assert.equal(await dialog.getByRole('combobox').count(), 0, 'No production character picker');
  return dialog;
}
async function closeEditor(page, dialog) {
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Preview game editor', exact: true })).toBeFocused();
}

try {
  // Seven automatic characters and edge-case privacy, using the same SVG as production.
  const page = await makePage({ reducedMotion: 'reduce' });
  await page.goto(url); const card = page.locator('[data-direction="society"]');
  for (let i = 0; i < labels.length; i++) {
    await choose(page, labels[i]); await finish(card);
    await page.evaluate(() => document.fonts.ready);
    const svg = card.locator(svgSelector); const text = await svg.textContent();
    if (i < 7) assert(text.includes(titles[i]), `${labels[i]} → ${titles[i]}`);
    assert(!/NEVER_RENDER|PAYMENTS|NaN|Infinity/.test(text));
    if (i === 5 || i === 6) assert(!/\$|MY NET RESULT|TABLE BUY-IN|TABLE REBUYS|DURATION|PLAYERS/.test(text));
    if (i === 8 || i === 9) assert(!/MY NET RESULT|TABLE BUY-IN|TABLE REBUYS/.test(text));
    if (i === 10) assert.match(text, /\+\$1\.01/);
    if (i === 11) assert(!text.includes('Mayor of Value Town'));
    await bounds(page, svg);
    if (i < 7 || i === 10) await download(page, page.getByRole('button', { name: 'Download PNG', exact: true }), `card-${i}.png`);
    await svg.screenshot({ path: output + `card-${i}-preview.png` });
    report.cards.push({ fixture: labels[i], privacyAndBounds: 'passed', export: i < 7 || i === 10 ? '2160 × 3840, embedded Inter' : 'preview checked' });
  }
  // Privacy changes invalidate the supporting persona synchronously and never replay.
  await choose(page, 'Recorded rebuy');
  await page.getByLabel('Rebuys', { exact: true }).uncheck();
  assert(!/Encore|rebuy/i.test(await card.locator(svgSelector).textContent())); await finish(card);
  await page.getByLabel('Rebuys', { exact: true }).check();
  assert.match(await card.locator(svgSelector).textContent(), /The Encore Artist/);
  await choose(page, 'Long game'); await page.getByLabel('Duration', { exact: true }).uncheck();
  assert(!/Marathoner|275|4h/.test(await card.locator(svgSelector).textContent()));
  // Verify editor at every requested viewport, including the desktop hidden-button focus trap.
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 740 : 1000 });
    await choose(page, 'Positive finish');
    await bounds(page, card.locator(svgSelector));
    await page.screenshot({ path: output + `lab-${width}.png`, fullPage: true });
    const dialog = await openEditor(page); await finish(dialog);
    await bounds(page, dialog.locator(svgSelector));
    const close = dialog.getByRole('button', { name: 'Close game recap' });
    const share = dialog.getByRole('button', { name: 'Share game card', exact: true });
    await close.focus(); await page.keyboard.press('Shift+Tab'); await expect(share).toBeFocused();
    await page.keyboard.press('Tab'); await expect(close).toBeFocused();
    await dialog.getByLabel('Show net result', { exact: true }).uncheck();
    await dialog.getByLabel('Show amounts and losses', { exact: true }).uncheck();
    assert(!/\$|MY NET RESULT|Mayor/.test(await dialog.locator(svgSelector).textContent()));
    await download(page, share, `editor-private-${width}.png`);
    await page.keyboard.press('Tab');
    assert(await dialog.evaluate(el => el.contains(document.activeElement)), 'Focus remains inside dialog after disabled export');
    await dialog.screenshot({ path: output + `editor-${width}.png` });
    await closeEditor(page, dialog);
    const reopened = await openEditor(page); await finish(reopened);
    await expect(reopened.getByLabel('Show net result', { exact: true })).not.toBeChecked();
    assert(!/\$|MY NET RESULT|Mayor/.test(await reopened.locator(svgSelector).textContent()));
    await closeEditor(page, reopened);
    report.viewports.push({ width, overflow: 'none', editorPrivacyExportFocusReopen: 'passed' });
  }
  // Production assignment uses canonical snapshots, including rebuy and duration facts.
  for (const [label, expected] of [['Negative finish', titles[1]], ['Break-even', titles[2]], ['Recorded rebuy', titles[3]], ['Long game', titles[4]], ['Unknown data', null], ['Cent precision', null]]) {
    await choose(page, label); const dialog = await openEditor(page);
    await dialog.getByLabel('Show net result', { exact: true }).setChecked(!['Recorded rebuy', 'Long game'].includes(label));
    if (expected) assert((await dialog.locator(svgSelector).textContent()).includes(expected));
    if (label === 'Unknown data') assert(!/MY NET RESULT|NaN|Infinity/.test(await dialog.locator(svgSelector).textContent()));
    if (label === 'Cent precision') assert.match(await dialog.locator(svgSelector).textContent(), /\+\$1\.01/);
    await closeEditor(page, dialog);
  }
  report.behavior.push('Seven lab assignments; canonical editor result/rebuy/duration/missing-data fixtures; privacy removal; restored supporting stats; four viewport exports and keyboard traps');
  await page.close();

  // Freeze time to prove the reveal is brief, skippable and cannot leak a transient export.
  const revealPage = await makePage();
  await revealPage.clock.install(); await revealPage.clock.pauseAt(new Date());
  await revealPage.goto(url);
  const lab = revealPage.locator('[data-direction="society"]');
  await expect(lab.locator('[data-recap-reveal]')).toHaveAttribute('data-recap-reveal', 'revealing');
  await lab.screenshot({ path: output + 'reveal-face-down.png', animations: 'allow' });
  const labSource = await download(revealPage, revealPage.getByRole('button', { name: 'Download PNG', exact: true }), 'during-lab-reveal.png');
  assert.match(labSource, /Mayor of/); await finish(lab);
  let dialog = await openEditor(revealPage);
  await expect(dialog.locator('[data-recap-reveal]')).toHaveAttribute('data-recap-reveal', 'revealing');
  assert(!await dialog.locator('[role="status"]').textContent().then(text => /Mayor/.test(text)), 'Announcement waits until reveal');
  await dialog.screenshot({ path: output + 'editor-face-down.png', animations: 'allow' });
  const skip = dialog.getByRole('button', { name: 'Skip reveal' });
  await skip.focus(); await revealPage.keyboard.press('Enter'); await finish(dialog);
  assert(await dialog.evaluate(el => el.contains(document.activeElement)), 'Skipping restores focus inside modal');
  await closeEditor(revealPage, dialog);
  dialog = await openEditor(revealPage); await finish(dialog);
  await expect(dialog.getByRole('button', { name: 'Skip reveal' })).toHaveCount(0);
  await closeEditor(revealPage, dialog);
  // A different game gets its own reveal. Sharing while covered completes it immediately.
  await choose(revealPage, 'Negative finish'); dialog = await openEditor(revealPage);
  await expect(dialog.locator('[data-recap-reveal]')).toHaveAttribute('data-recap-reveal', 'revealing');
  await dialog.getByLabel('Show net result', { exact: true }).uncheck();
  await dialog.getByLabel('Show amounts and losses', { exact: true }).uncheck();
  const source = await download(revealPage, dialog.getByRole('button', { name: 'Share game card', exact: true }), 'during-editor-reveal-private.png');
  assert(!/Sponsor|MY NET RESULT|\$/.test(source)); await finish(dialog);
  await closeEditor(revealPage, dialog);
  // Changing the OS preference while revealing completes without another turn.
  await closeEditor(revealPage, await openEditor(revealPage));
  await choose(revealPage, 'Cent precision'); dialog = await openEditor(revealPage);
  await expect(dialog.locator('[data-recap-reveal]')).toHaveAttribute('data-recap-reveal', 'revealing');
  await revealPage.emulateMedia({ reducedMotion: 'reduce' });
  await revealPage.clock.runFor(20); await finish(dialog);
  await closeEditor(revealPage, dialog); await revealPage.emulateMedia({ reducedMotion: 'no-preference' });
  // Time completion and early dismissal do not replay on reopen.
  await choose(revealPage, 'Break-even'); dialog = await openEditor(revealPage);
  await revealPage.clock.runFor(1300); await finish(dialog); await closeEditor(revealPage, dialog);
  await choose(revealPage, 'Unknown data'); dialog = await openEditor(revealPage);
  await expect(dialog.locator('[data-recap-reveal]')).toHaveAttribute('data-recap-reveal', 'revealing');
  await closeEditor(revealPage, dialog); dialog = await openEditor(revealPage); await finish(dialog);
  await closeEditor(revealPage, dialog);
  report.behavior.push('Frozen-time face-down state; 1.2s completion; Enter skip and focus; early-close/reopen; complete PNG during lab and editor reveal; hidden result never announced');
  await revealPage.close();

  // Browser share API boundaries are mocked; PNG creation and file downloads are real.
  const sharePage = await makePage({ reducedMotion: 'reduce' }); await sharePage.goto(url);
  const shareDialog = await openEditor(sharePage); await finish(shareDialog);
  await expect(shareDialog.getByRole('button', { name: 'Skip reveal' })).toHaveCount(0);
  await shareDialog.getByLabel('Show net result', { exact: true }).uncheck();
  await shareDialog.getByLabel('Show amounts and losses', { exact: true }).uncheck();
  const shareButton = shareDialog.getByRole('button', { name: 'Share game card', exact: true });
  // Hold the export font request to inspect the in-flight control/focus state.
  let releaseFont;
  const fontGate = new Promise(resolve => { releaseFont = resolve; });
  await sharePage.route('**/fonts/inter-latin.woff2', async route => { await fontGate; await route.continue(); });
  await sharePage.evaluate(() => { window.__shareMode = 'success'; });
  await shareButton.click();
  await expect(shareButton).toBeDisabled();
  await expect(shareDialog.getByLabel('Show net result', { exact: true })).toBeDisabled();
  await shareButton.evaluate(el => el.click());
  await sharePage.keyboard.press('Tab');
  assert(await shareDialog.evaluate(el => el.contains(document.activeElement)), 'Exporting focus trap');
  releaseFont(); await expect(shareButton).toBeEnabled();
  assert.equal(await sharePage.evaluate(() => window.__shares.length), 1, 'Only one export/share while busy');
  await sharePage.unroute('**/fonts/inter-latin.woff2');
  await sharePage.evaluate(() => { window.__shares = []; });
  let downloads = 0; sharePage.on('download', () => downloads++);
  for (const mode of ['success', 'abort', 'error']) {
    await sharePage.evaluate(mode => { window.__shareMode = mode; }, mode);
    if (mode === 'error') await download(sharePage, shareButton, 'share-error-fallback.png');
    else { await shareButton.click(); await expect(shareButton).toBeEnabled(); }
  }
  assert.equal(downloads, 1, 'Cancellation does not download; failed share falls back');
  const shares = await sharePage.evaluate(() => window.__shares);
  assert.equal(shares.length, 3);
  shares.forEach(share => {
    assert(!/Mayor|Sponsor|Baron|NEVER_RENDER|\$/.test(share.text));
    assert.deepEqual(share.dimensions, [2160, 3840]); assert.equal(share.type, 'image/png');
  });
  await closeEditor(sharePage, shareDialog); await sharePage.reload();
  const reloaded = await openEditor(sharePage); await finish(reloaded);
  await expect(reloaded.getByLabel('Show net result', { exact: true })).not.toBeChecked();
  assert(!/\$|MY NET RESULT|Mayor/.test(await reloaded.locator(svgSelector).textContent()));
  report.behavior.push('Reduced motion; share success; cancellation without download; failed/unsupported share downloads; privacy-safe captions; reload restores privacy before first card');
  await closeEditor(sharePage, reloaded);
  // Previously saved hidden-player/loss privacy must be safe at the first editor render.
  for (const [label, id, privacy] of [
    ['Hidden player', 'hidden', { hiddenPlayerIds: ['subject'] }],
    ['Hidden loss', 'hidden-loss', { showLosses: false }],
  ]) {
    await choose(sharePage, label);
    await sharePage.evaluate(({ id, privacy }) => sessionStorage.setItem(`mainpot:recap-privacy:v1:${JSON.stringify([id, 'subject'])}`, JSON.stringify(privacy)), { id, privacy });
    const hidden = await openEditor(sharePage);
    const text = await hidden.locator(svgSelector).textContent();
    assert(!/MY NET RESULT|TABLE BUY-IN|TABLE REBUYS|Sponsor/.test(text));
    if (label === 'Hidden player') assert(!/Encore/.test(text));
    await closeEditor(sharePage, hidden);
  }
  report.behavior.push('In-flight export locks stats and suppresses duplicates; focus remains trapped; saved hidden-player/hidden-loss privacy is safe on first render; mid-reveal OS reduced-motion change completes');
  await sharePage.close();
  assert.deepEqual(errors, [], 'Browser errors');
  await writeFile(output + 'verification.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ cards: report.cards.length, viewports: report.viewports.map(v => v.width), behavior: report.behavior, errors }, null, 2));
} finally { await browser.close(); }
