import { test, type Browser } from "@playwright/test";

type ContextOptions = NonNullable<Parameters<Browser["newContext"]>[0]>;

/**
 * Creates an independent browser identity while preserving the active
 * Playwright project's device emulation. Direct `browser.newContext()` calls
 * otherwise default to desktop Chromium even in mobile and tablet projects.
 */
export function createDeviceContext(
  browser: Browser,
  explicitOptions: ContextOptions = {},
) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = test.info().project.use;
  return browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    ...explicitOptions,
  });
}
