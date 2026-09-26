import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

const supabaseCommand = process.platform === "win32" ? "supabase.cmd" : "supabase";
const timeoutMs = 3_000;
const localReadinessTimeoutMs = 30_000;
const disposableApiUrl = "http://127.0.0.1:55321";
const localRealtimeContainer = "supabase_realtime_mainpot-e2e";
const localReadyMarker = /Muster\[realtime@127\.0\.0\.1\|realtime_channels_local\] status .* -> :ready/;

function localStatus() {
  const status = JSON.parse(execFileSync(supabaseCommand, [...(process.env.SUPABASE_WORKDIR ? ["--workdir", process.env.SUPABASE_WORKDIR] : []), "status", "--output", "json"], { encoding: "utf8" }));
  if (process.env.SUPABASE_EXPECTED_API_URL && status.API_URL !== process.env.SUPABASE_EXPECTED_API_URL) throw new Error("Canary API did not match the disposable stack.");
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(status.API_URL ?? "")) {
    throw new Error(`Refusing to run against non-local Supabase URL: ${status.API_URL}`);
  }
  return status;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function waitForSubscription(channel: RealtimeChannel): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve(true);
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  });
}

function waitForChange(register: (handler: () => void) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    register(() => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

function currentRealtimeContainerId(): string {
  return execFileSync("docker", ["inspect", "--format", "{{.Id}} {{.State.StartedAt}}", localRealtimeContainer], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function currentRealtimeContainerIsReady(containerId: string): boolean {
  try {
    if (currentRealtimeContainerId() !== containerId) return false;
    const [id, startedAt] = containerId.split(" ");
    const logs = execFileSync("docker", ["logs", "--since", startedAt, id], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return localReadyMarker.test(logs);
  } catch {
    return false;
  }
}

async function waitForLocalRealtimeReadiness(): Promise<{ ready: boolean; elapsedMs: number }> {
  const startedAt = Date.now();
  let containerId: string;
  try {
    containerId = currentRealtimeContainerId();
  } catch {
    return { ready: false, elapsedMs: Date.now() - startedAt };
  }

  while (Date.now() - startedAt < localReadinessTimeoutMs) {
    if (currentRealtimeContainerIsReady(containerId)) return { ready: true, elapsedMs: Date.now() - startedAt };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { ready: false, elapsedMs: Date.now() - startedAt };
}

const status = localStatus();
const url = status.API_URL;
const serviceKey = status.SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Local Supabase service-role credentials are incomplete.");

const database = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const realtime = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const probeId = randomUUID();
let acknowledgeChange: (() => void) | undefined;
let inserted = false;
const channel = realtime
  .channel(`mainpot-canary-test-${probeId}`)
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "product_ops_canary" },
    (payload) => {
      if (payload.new.probe_id === probeId) acknowledgeChange?.();
    }
  );

try {
  console.log("Running local Product Ops database and Realtime canary…");
  const subscribed = await waitForSubscription(channel);
  assert(subscribed, "canary subscribes to the dedicated Realtime table");

  if (url === disposableApiUrl && process.env.SUPABASE_EXPECTED_API_URL === disposableApiUrl) {
    // The local single-node image reports cluster readiness after HTTP health
    // and replication startup. Do not measure delivery during that setup gap.
    const readiness = await waitForLocalRealtimeReadiness();
    assert(readiness.ready, "current disposable Realtime cluster reports ready before canary insert");
    console.log(`Disposable Realtime cluster ready (${readiness.elapsedMs} ms); INSERT delivery keeps its ${timeoutMs} ms budget.`);
  }

  const changed = waitForChange((handler: () => void) => { acknowledgeChange = handler; });
  // A lost acknowledgement can hide a committed insert; cleanup its exact ID.
  inserted = true;
  const { error: insertError } = await database.from("product_ops_canary").insert({ probe_id: probeId });
  assert(!insertError, "server role can insert a synthetic canary row");
  assert(await changed, "canary insert is delivered through Realtime");

  const { error: deleteError } = await database.from("product_ops_canary").delete().eq("probe_id", probeId);
  assert(!deleteError, "server role removes its synthetic canary row");
  inserted = false;
  console.log("✓ dedicated database insert/delete and Realtime delivery passed");
} finally {
  if (inserted) await database.from("product_ops_canary").delete().eq("probe_id", probeId);
  await realtime.removeChannel(channel);
  realtime.realtime.disconnect();
}
