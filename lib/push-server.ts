import webpush from "web-push";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT;

let configured = false;
let adminClient: SupabaseClient | null = null;

export function pushIsConfigured(): boolean {
  return Boolean(
    supabaseUrl
      && serviceRoleKey
      && publicKey
      && privateKey
      && subject
  );
}

export function getPublicPushConfig(): { enabled: boolean; publicKey: string | null } {
  return {
    enabled: pushIsConfigured(),
    publicKey: pushIsConfigured() ? publicKey! : null,
  };
}

export function getPushAdminClient(): SupabaseClient | null {
  if (!pushIsConfigured() || !supabaseUrl || !serviceRoleKey) return null;
  adminClient ??= createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

function configureWebPush(): void {
  if (configured || !pushIsConfigured()) return;
  webpush.setVapidDetails(subject!, publicKey!, privateKey!);
  configured = true;
}

export async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: Record<string, unknown>,
  ttlSeconds: number
): Promise<void> {
  configureWebPush();
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload),
    { TTL: ttlSeconds, urgency: "normal" }
  );
}
