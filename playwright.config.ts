import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const localBaseURL = `http://127.0.0.1:${port}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? localBaseURL;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: process.env.PLAYWRIGHT_REALTIME === "1"
    ? "**/realtime.spec.ts"
    : "**/smoke.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: `npm run build && npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: localBaseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
