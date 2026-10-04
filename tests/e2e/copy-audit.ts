import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { AxeResults } from "axe-core";

/** Optional receipts from existing isolated-account journeys, never live users. */
export async function captureCopyAudit(page: Page, state: string) {
  const directory = process.env.MAINPOT_COPY_AUDIT_OUTPUT;
  if (!directory) return;
  const output = resolve(directory);
  await mkdir(output, { recursive: true });
  // Capture settled copy, after transient toast messages clear naturally.
  await expect(page.locator('[role="status"].fixed')).toHaveText("");
  await page.evaluate(() => Promise.allSettled(document.getAnimations()
    .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
    .map(animation => animation.finished)));
  await page.addScriptTag({ path: createRequire(resolve("package.json")).resolve("axe-core/axe.min.js") });
  const receipt = await page.evaluate(async () => {
    // axe is injected only for an explicitly requested local audit.
    const axe = (window as unknown as { axe: { run: (root: Document, options: object) => Promise<AxeResults> } }).axe;
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
    });
    return {
      title: document.title,
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clippedNames: [...document.querySelectorAll('[data-testid="friend-name"]')].flatMap((node, index) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const text = range.getBoundingClientRect();
        const box = node.getBoundingClientRect();
        return text.left < box.left - 1 || text.right > box.right + 1
          ? [{ index, className: node.className }] : [];
      }),
      violations: result.violations.map(item => ({ id: item.id, impact: item.impact,
        nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })),
      incomplete: result.incomplete.map(item => ({ id: item.id,
        nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })),
    };
  });
  const stem = `${test.info().project.name}-${state}`;
  await writeFile(`${output}/${stem}.json`, JSON.stringify(receipt, null, 2));
  // WebKit full-page captures otherwise place sticky navigation at the
  // current scroll position inside the exported image.
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  await page.screenshot({ path: `${output}/${stem}.png`, fullPage: true, timeout: 15_000 });
  expect(receipt.scrollWidth, `${state}: horizontal reflow`).toBeLessThanOrEqual(receipt.width);
  expect(receipt.violations, `${state}: axe violations`).toEqual([]);
  expect(receipt.clippedNames, `${state}: readable friend names`).toEqual([]);
}
