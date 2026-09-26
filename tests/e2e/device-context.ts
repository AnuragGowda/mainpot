import { test, type Browser } from "@playwright/test";

type ContextOptions = NonNullable<Parameters<Browser["newContext"]>[0]>;

/**
 * Creates an independent browser identity while preserving the active
 * Playwright project's device emulation. Direct `browser.newContext()` calls
 * otherwise default to desktop Chromium even in mobile and tablet projects.
 */
export async function createDeviceContext(
  browser: Browser,
  explicitOptions: ContextOptions = {},
) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = test.info().project.use;
  const context = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    // Financial request interception must reach the page in WebKit too.
    // Actual service-worker recovery is verified separately in pwa-flow.ts.
    serviceWorkers: "block",
    ...explicitOptions,
  });
  if (process.env.PLAYWRIGHT_INPUT_DIAGNOSTICS === "1") {
    await context.addInitScript(() => {
      const nodes = new WeakMap<Element, number>();
      let sequence = 0;
      const nodeId = (node: Element) => {
        if (!nodes.has(node)) nodes.set(node, ++sequence);
        return nodes.get(node);
      };
      for (const type of ["focusin", "input", "change", "focusout"]) {
        document.addEventListener(type, (event) => {
          const input = event.target;
          if (!(input instanceof HTMLInputElement)) return;
          const label = input.getAttribute("aria-label") ?? "";
          if (!/Cash-out amount|Final chips for early cash-out/.test(label)) return;
          const log = (phase: string) => {
            const current = Array.from(document.querySelectorAll("input")).find(node => node.getAttribute("aria-label") === label);
            console.debug("[amount-event]", JSON.stringify({ phase, type, label, value: input.value, node: nodeId(input), connected: input.isConnected, currentNode: current ? nodeId(current) : null, currentValue: current?.value }));
          };
          log("event");
          requestAnimationFrame(() => log("frame"));
        }, true);
      }
    });
  }
  return context;
}
