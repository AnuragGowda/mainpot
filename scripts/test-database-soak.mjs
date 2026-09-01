import { spawnSync } from "node:child_process";

const durationMs = Number(process.env.SOAK_DURATION_MS ?? 30 * 60 * 1_000);
if (!Number.isFinite(durationMs) || durationMs < 60_000) {
  throw new Error("SOAK_DURATION_MS must be at least 60000.");
}

const deadline = Date.now() + durationMs;
let completed = 0;

console.log(`Running local database churn soak for ${Math.round(durationMs / 60_000)} minute(s)…`);
while (Date.now() < deadline) {
  const result = spawnSync(process.execPath, ["scripts/test-database-assurance.mjs"], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  completed += 1;
}

console.log(`Database churn soak passed (${completed} complete assurance cycles).`);
