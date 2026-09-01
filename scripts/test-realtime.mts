import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const isWindows = process.platform === "win32";
const supabaseCommand = isWindows ? "supabase.cmd" : "supabase";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptDirectory, "..");
const testProjectId = "mainpot-e2e";
const testAppPort = "3110";
const testDistDirectory = ".next-e2e";
const testConfig = join(repositoryRoot, "tests", "supabase", "config.toml");
const sourceMigrations = join(repositoryRoot, "supabase", "migrations");
const stackLockDirectory = join(tmpdir(), "mainpot-e2e-supabase.lock");
const databaseAssuranceOnly = process.argv.includes("--database-assurance-only");

type RunOptions = {
  capture?: boolean;
  env?: NodeJS.ProcessEnv;
};

function run(command: string, args: readonly string[], options: RunOptions = {}): string {
  const result = spawnSync(command, args, {
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: options.env ?? process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr]
      .filter(Boolean)
      .join("\n")
      .replaceAll(/(key|secret|password)\s*[=:]\s*[^\s]+/gi, "$1=[redacted]");
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? 1}.${detail ? `\n${detail}` : ""}`);
  }
  return typeof result.stdout === "string" ? result.stdout : "";
}

function verifyDockerContext() {
  const activeContext = run("docker", ["context", "show"], { capture: true }).trim();
  // macOS development is standardized on OrbStack. GitHub's Linux runners
  // correctly use Docker's default context and must remain eligible for this
  // disposable Supabase test stack.
  if (process.platform === "darwin" && activeContext !== "orbstack") {
    throw new Error(`Realtime tests require the OrbStack Docker context; active context is ${activeContext || "unknown"}.`);
  }
}

function createTestWorkdir() {
  if (!existsSync(testConfig) || !existsSync(sourceMigrations)) {
    throw new Error("Realtime Supabase test configuration or migrations are missing.");
  }

  const workdir = mkdtempSync(join(tmpdir(), "mainpot-e2e-supabase-"));
  const supabaseDirectory = join(workdir, "supabase");
  mkdirSync(supabaseDirectory);
  cpSync(testConfig, join(supabaseDirectory, "config.toml"));
  symlinkSync(sourceMigrations, join(supabaseDirectory, "migrations"), "dir");
  return workdir;
}

function acquireStackLock() {
  try {
    mkdirSync(stackLockDirectory);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      throw new Error(
        "Realtime tests are already using the disposable Supabase stack. Wait for that run to finish before starting another one.",
      );
    }
    throw error;
  }
}

let workdir: string | undefined;
let stackStarted = false;
let lockHeld = false;
let cleaningUp = false;

function cleanup() {
  if (cleaningUp) return;
  cleaningUp = true;

  if (stackStarted && workdir) {
    console.log("Stopping disposable Supabase test stack…");
    try {
      run(supabaseCommand, ["--workdir", workdir, "stop", "--project-id", testProjectId, "--no-backup"], { capture: true });
    } catch (error) {
      process.exitCode ??= 1;
      console.error(error instanceof Error ? error.message : error);
    }
  }
  if (workdir) rmSync(workdir, { recursive: true, force: true });
  if (lockHeld) rmSync(stackLockDirectory, { recursive: true, force: true });
}

function exitAfterSignal(signal: NodeJS.Signals) {
  process.exitCode = signal === "SIGINT" ? 130 : 143;
  cleanup();
  process.exit(process.exitCode);
}

process.once("SIGINT", () => exitAfterSignal("SIGINT"));
process.once("SIGTERM", () => exitAfterSignal("SIGTERM"));

try {
  acquireStackLock();
  lockHeld = true;
  verifyDockerContext();
  workdir = createTestWorkdir();
  console.log("Starting disposable Supabase test stack…");
  run(supabaseCommand, ["--workdir", workdir, "start"], { capture: true });
  stackStarted = true;
  console.log("Resetting disposable Supabase test database…");
  run(supabaseCommand, ["--workdir", workdir, "db", "reset", "--local", "--no-seed"], { capture: true });

  console.log("Reading disposable Supabase test configuration…");
  const status = JSON.parse(run(supabaseCommand, ["--workdir", workdir, "status", "--output", "json"], { capture: true }));
  const apiUrl = status.API_URL;
  const anonKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;

  if (!apiUrl || !anonKey || !apiUrl.startsWith("http://127.0.0.1:55321")) {
    throw new Error("Disposable Supabase stack did not report its expected local API configuration.");
  }

  if (databaseAssuranceOnly) {
    console.log("Running database assurance checks against the disposable migration stack…");
    run(process.execPath, [join(scriptDirectory, "test-database-assurance.mts")], {
      env: {
        ...process.env,
        SUPABASE_WORKDIR: workdir,
        SUPABASE_EXPECTED_API_URL: apiUrl,
      },
    });
  } else {
    console.log("Running realtime browser tests…");
    const result = spawnSync("npx", ["playwright", "test", "tests/e2e/realtime.spec.ts"], {
      stdio: "inherit",
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: apiUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
        NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${testAppPort}`,
        NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "false",
        NEXT_E2E_DIST_DIR: testDistDirectory,
        PLAYWRIGHT_PORT: testAppPort,
        PLAYWRIGHT_REALTIME: "1",
      },
    });

    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  }
} finally {
  cleanup();
  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");
}
