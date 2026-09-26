"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  getCurrentPushSubscription,
  getPushConfig,
  isIosDevice,
  isStandaloneDisplay,
  subscribeToPush,
  unsubscribeFromPush,
  type PushConfig,
} from "@/lib/push-client";

export interface GameNotificationsProps {
  isHost: boolean;
}

export default function GameNotifications({
  isHost,
}: GameNotificationsProps) {
  const { toast } = useToast();
  const cardRef = useRef<HTMLElement>(null);
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const supportsPush = "serviceWorker" in navigator
      && "PushManager" in window
      && "Notification" in window;
    const nextIos = isIosDevice(
      navigator.userAgent,
      navigator.platform,
      navigator.maxTouchPoints
    );

    setPushSupported(supportsPush);
    setIos(nextIos);
    setStandalone(isStandaloneDisplay());
    // Device-only games have no server ledger to send push notifications for.
    // Avoid starting an unsupported request that can outlive full navigation.
    if (!isSupabaseConfigured) {
      setConfig({ enabled: false, publicKey: null });
      return;
    }
    const abortConfig = (event: PageTransitionEvent) => {
      // A cached history entry resumes this effect instead of mounting again.
      if (!event.persisted) controller.abort();
    };
    window.addEventListener("pagehide", abortConfig);
    void getPushConfig(controller.signal)
      .then(async (nextConfig) => {
        if (!active) return;
        setConfig(nextConfig);
        if (nextConfig.enabled && supportsPush) {
          const current = await getCurrentPushSubscription();
          if (active) setSubscription(current);
        }
      })
      .catch(() => {
        if (active) setConfig({ enabled: false, publicKey: null });
      });

    return () => {
      active = false;
      window.removeEventListener("pagehide", abortConfig);
      controller.abort();
    };
  }, []);

  const available = config?.enabled === true
    && pushSupported
    && (!ios || standalone);

  useEffect(() => {
    if (!expanded) return;
    const timeout = window.setTimeout(() => {
      cardRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
      });
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [expanded]);

  if (!available) return null;

  async function handlePrimaryAction() {
    setError(null);

    if (!config?.publicKey) return;
    setBusy(true);
    try {
      const nextSubscription = await subscribeToPush(config.publicKey);
      setSubscription(nextSubscription);
      setExpanded(false);
      toast("Game alerts are on", "success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not turn on game alerts.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnsubscribe() {
    if (!subscription) return;
    setBusy(true);
    setError(null);
    try {
      await unsubscribeFromPush(subscription);
      setSubscription(null);
      setExpanded(false);
      toast("Game alerts are off");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not turn off game alerts.");
    } finally {
      setBusy(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 ${
          subscription
            ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            : "bg-white text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 hover:text-gray-950"
        }`}
      >
        {subscription ? <BellRing aria-hidden size={17} /> : <Bell aria-hidden size={17} />}
        {subscription ? "Game alerts on" : "Set up game alerts"}
      </button>
    );
  }

  return (
    <section
      ref={cardRef}
      aria-labelledby="game-alerts-heading"
      className="mt-5 overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-sm"
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-900 text-white shadow-sm">
            {subscription ? <BellRing aria-hidden size={19} /> : <Bell aria-hidden size={19} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
              Game alerts
            </p>
            <h2 id="game-alerts-heading" className="mt-1 text-base font-semibold tracking-tight text-gray-950 sm:text-lg">
              {subscription
                ? "You’ll hear about the moments that matter."
                : "Put your phone down. We’ll tell you when it matters."}
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-gray-600">
              {subscription
                ? "Mainpot will alert this device when a player joins, cash-outs begin, or the final settlement is ready."
                : isHost
                  ? "Get a quiet alert when someone joins, cash-outs begin, or the final settlement is ready."
                  : "Get a quiet alert when cash-outs begin or the final settlement is ready."}
            </p>

            {error ? (
              <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {subscription ? (
                <Button size="sm" variant="secondary" loading={busy} onClick={handleUnsubscribe}>
                  Turn off alerts
                </Button>
              ) : (
                <Button size="sm" loading={busy} leftIcon={<Bell aria-hidden size={16} />} onClick={handlePrimaryAction}>
                  Turn on game alerts
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setExpanded(false);
                  setError(null);
                }}
              >
                {subscription ? "Done" : "Not now"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
