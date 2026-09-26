import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? "3101");
const localBaseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/entry-ux.spec.ts",
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? localBaseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: `npm run build && npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: localBaseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
