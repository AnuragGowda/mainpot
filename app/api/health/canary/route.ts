import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const CANARY_TIMEOUT_MS = 1_500;

function configured(): boolean {
  const key = process.env.MAINPOT_CANARY_KEY;
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
      && process.env.SUPABASE_SERVICE_ROLE_KEY
      && key
      && key.length >= 32
  );
}

function authorized(request: Request): boolean {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const expected = process.env.MAINPOT_CANARY_KEY ?? "";
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return tokenBuffer.length === expectedBuffer.length
    && tokenBuffer.length > 0
    && crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
}

function healthResponse(database: boolean, realtime: boolean, status: number): Response {
  return Response.json(
    { status: database && realtime ? "ok" : "degraded", database, realtime },
    { status, headers: { "cache-control": "private, no-store" } }
  );
}

function waitForSubscription(channel: ReturnType<ReturnType<typeof createClient>["channel"]>): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), CANARY_TIMEOUT_MS);
    channel.subscribe((status) => {
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
    const timeout = setTimeout(() => resolve(false), CANARY_TIMEOUT_MS);
    register(() => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

export const runtime = "nodejs";

/**
 * A bearer-authenticated synthetic check. It writes and removes only a row in
 * product_ops_canary, never a customer game or ledger record.
 */
export async function POST(request: Request) {
  if (!configured() || !authorized(request)) {
    return new Response(null, { status: 401, headers: { "www-authenticate": "Bearer" } });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const database = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const realtime = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const probeId = crypto.randomUUID();
  let acknowledgeChange: (() => void) | undefined;
  let probeInserted = false;
  const channel = realtime
    .channel(`mainpot-canary-${probeId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "product_ops_canary" },
      (payload) => {
        if (payload.new.probe_id === probeId) acknowledgeChange?.();
      }
    );

  try {
    const subscribed = await waitForSubscription(channel);
    const change = subscribed
      ? waitForChange((handler) => { acknowledgeChange = handler; })
      : Promise.resolve(false);
    const { error: insertError } = await database.from("product_ops_canary").insert({ probe_id: probeId });
    if (insertError) return healthResponse(false, false, 503);
    probeInserted = true;

    const realtimeHealthy = await change;
    const { error: deleteError } = await database.from("product_ops_canary").delete().eq("probe_id", probeId);
    if (!deleteError) probeInserted = false;
    if (deleteError) return healthResponse(true, Boolean(realtimeHealthy), 503);
    return healthResponse(true, Boolean(realtimeHealthy), realtimeHealthy ? 200 : 503);
  } catch {
    return healthResponse(false, false, 503);
  } finally {
    if (probeInserted) {
      await database.from("product_ops_canary").delete().eq("probe_id", probeId);
    }
    await realtime.removeChannel(channel);
  }
}
