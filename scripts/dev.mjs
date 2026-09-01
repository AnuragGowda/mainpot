import { spawn, spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const supabaseCommand = isWindows ? "supabase.cmd" : "supabase";
const nextCommand = isWindows ? "next.cmd" : "next";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });

  if (result.error) {
    console.error(`Could not run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? "";
}

function readLocalConfig() {
  const output = run(supabaseCommand, ["status", "--output", "json"], {
    capture: true,
  });

  try {
    return JSON.parse(output);
  } catch {
    console.error("Supabase started, but its local connection details could not be read.");
    console.error("Run `npm run db:status` to inspect the local stack.");
    process.exit(1);
  }
}

console.log("Starting Mainpot's local Supabase stack…");
run(supabaseCommand, ["start"]);
run(supabaseCommand, ["migration", "up", "--local"]);

const local = readLocalConfig();
const apiUrl = local.API_URL;
const publishableKey = local.PUBLISHABLE_KEY ?? local.ANON_KEY;
const serviceRoleKey = local.SERVICE_ROLE_KEY;

if (!apiUrl || !publishableKey) {
  console.error("Supabase did not report an API URL and publishable key.");
  process.exit(1);
}

console.log(`Mainpot:         http://localhost:3000`);
if (local.STUDIO_URL) console.log(`Supabase Studio: ${local.STUDIO_URL}`);
if (local.MAILPIT_URL) console.log(`Local email:     ${local.MAILPIT_URL}`);

// Auth redirect URLs in supabase/config.toml intentionally use the standard
// development port, so do not let Next.js silently fall back to another port.
const child = spawn(nextCommand, ["dev", "--port", "3000", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    // The existing variable name is retained for compatibility with hosted
    // projects; current local stacks supply a publishable key here.
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publishableKey,
    ...(serviceRoleKey ? { SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey } : {}),
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "false",
  },
});

child.on("error", (error) => {
  console.error(`Could not start Next.js: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
