import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

const supabaseCommand = process.platform === "win32" ? "supabase.cmd" : "supabase";
const timeoutMs = 3_000;

function localStatus() {
  const status = JSON.parse(execFileSync(supabaseCommand, ["status", "--output", "json"], { encoding: "utf8" }));
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

  const changed = waitForChange((handler: () => void) => { acknowledgeChange = handler; });
  const { error: insertError } = await database.from("product_ops_canary").insert({ probe_id: probeId });
  assert(!insertError, "server role can insert a synthetic canary row");
  inserted = true;
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
