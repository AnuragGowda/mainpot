import { defineConfig, devices } from "@playwright/test";

const isRealtimeSuite = process.env.PLAYWRIGHT_REALTIME === "1";
const isMobileSmokeSuite = process.env.PLAYWRIGHT_MOBILE === "1";
const port = Number(process.env.PLAYWRIGHT_PORT ?? "3100");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PLAYWRIGHT_PORT must be a valid TCP port, received: ${process.env.PLAYWRIGHT_PORT}`);
}
const localBaseURL = `http://127.0.0.1:${port}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? localBaseURL;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: isRealtimeSuite
    ? "**/realtime.spec.ts"
    : "**/smoke.spec.ts",
  fullyParallel: true,
  timeout: isMobileSmokeSuite ? 60_000 : 30_000,
  workers: process.env.CI && isMobileSmokeSuite ? 2 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    ...(isMobileSmokeSuite
      ? [
          { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
          { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
        ]
      : [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]),
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: `npm run build && npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: localBaseURL,
    timeout: 120_000,
    // Realtime tests must start their own app server. Reusing a developer's
    // server could send the test browser to the normal local database.
    reuseExistingServer: !isRealtimeSuite && !process.env.CI,
  },
});
