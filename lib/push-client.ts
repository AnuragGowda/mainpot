export const POST_GAME_ENTRY_KEY = "mainpot_post_game_entry";
export const PUSH_NUDGE_SNOOZE_KEY = "mainpot_push_nudge_snoozed_until";

export interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __mainpotInstallPrompt?: BeforeInstallPromptEvent;
  }

  interface Navigator {
    standalone?: boolean;
  }
}

export function markPostGameEntry(code: string): void {
  try {
    window.sessionStorage.setItem(POST_GAME_ENTRY_KEY, code);
  } catch {
    // The room still works when storage is unavailable.
  }
}

export function consumePostGameEntry(code: string): boolean {
  try {
    if (window.sessionStorage.getItem(POST_GAME_ENTRY_KEY) !== code) {
      return false;
    }
    window.sessionStorage.removeItem(POST_GAME_ENTRY_KEY);
    return true;
  } catch {
    return false;
  }
}

export function isIosDevice(
  userAgent: string,
  platform: string,
  maxTouchPoints: number
): boolean {
  return /iPad|iPhone|iPod/i.test(userAgent)
    || (platform === "MacIntel" && maxTouchPoints > 1);
}

export function isStandaloneDisplay(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || navigator.standalone === true;
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function sameApplicationServerKey(
  subscription: PushSubscription,
  expected: Uint8Array<ArrayBuffer>
): boolean {
  const existing = subscription.options.applicationServerKey;
  if (!existing) return false;
  const bytes = new Uint8Array(existing);
  return bytes.length === expected.length
    && bytes.every((value, index) => value === expected[index]);
}

export async function getPushConfig(): Promise<PushConfig> {
  const response = await fetch("/api/push/config", { cache: "no-store" });
  if (!response.ok) return { enabled: false, publicKey: null };
  const config = await response.json() as Partial<PushConfig>;
  return {
    enabled: config.enabled === true && typeof config.publicKey === "string",
    publicKey: typeof config.publicKey === "string" ? config.publicKey : null,
  };
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(publicKey: string): Promise<PushSubscription> {
  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied"
      ? "Notifications are blocked in your browser settings."
      : "Notification permission was not granted.");
  }

  const registration = await navigator.serviceWorker.ready;
  const applicationServerKey = urlBase64ToUint8Array(publicKey);
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameApplicationServerKey(subscription, applicationServerKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  const serialized = subscription.toJSON();
  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(serialized),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error ?? "Mainpot could not save this notification subscription.");
  }
  return subscription;
}

export async function unsubscribeFromPush(subscription: PushSubscription): Promise<void> {
  const endpoint = subscription.endpoint;
  const response = await fetch("/api/push/subscriptions", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) {
    throw new Error("Mainpot could not turn off notifications.");
  }
  await subscription.unsubscribe();
}

export type GamePushEvent = "player_joined" | "game_settling" | "game_finalized";

export function dispatchGamePush(
  gameId: string,
  event: GamePushEvent,
  subjectPlayerId?: string
): void {
  void fetch("/api/push/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameId, event, subjectPlayerId }),
    keepalive: true,
  }).catch(() => {
    // Push delivery is best-effort and must never block the game ledger.
  });
}
