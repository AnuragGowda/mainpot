import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const supabaseCommand = isWindows ? "supabase.cmd" : "supabase";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    env: options.env ?? process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout ?? "";
}

// Keep the local stack running after the test. It is the developer's reusable
// workspace database, and the test creates uniquely coded games.
console.log("Starting local Supabase…");
run(supabaseCommand, ["start"], { capture: true });
run(supabaseCommand, ["migration", "up", "--local"], { capture: true });

const status = JSON.parse(run(supabaseCommand, ["status", "--output", "json"], { capture: true }));
const apiUrl = status.API_URL;
const anonKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;

if (!apiUrl || !anonKey) {
  throw new Error("Supabase did not report local API credentials.");
}

const result = spawnSync("npx", ["playwright", "test", "tests/e2e/realtime.spec.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
    NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "false",
    PLAYWRIGHT_REALTIME: "1",
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
