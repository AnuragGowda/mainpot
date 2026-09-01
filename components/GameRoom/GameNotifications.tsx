"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellRing, Download, Share2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { Game } from "@/lib/types";
import {
  PUSH_NUDGE_SNOOZE_KEY,
  consumePostGameEntry,
  getCurrentPushSubscription,
  getPushConfig,
  isIosDevice,
  isStandaloneDisplay,
  subscribeToPush,
  unsubscribeFromPush,
  type BeforeInstallPromptEvent,
  type PushConfig,
} from "@/lib/push-client";

const NUDGE_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function nudgeIsSnoozed(): boolean {
  try {
    return Number(window.localStorage.getItem(PUSH_NUDGE_SNOOZE_KEY)) > Date.now();
  } catch {
    return false;
  }
}

function snoozeNudge(): void {
  try {
    window.localStorage.setItem(
      PUSH_NUDGE_SNOOZE_KEY,
      String(Date.now() + NUDGE_SNOOZE_MS)
    );
  } catch {
    // A dismissed card can still collapse when storage is unavailable.
  }
}

export interface GameNotificationsProps {
  game: Pick<Game, "id" | "code" | "name">;
  isHost: boolean;
  deferNudge?: boolean;
}

export default function GameNotifications({
  game,
  isHost,
  deferNudge = false,
}: GameNotificationsProps) {
  const { toast } = useToast();
  const cardRef = useRef<HTMLElement>(null);
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installAccepted, setInstallAccepted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showInstallSteps, setShowInstallSteps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
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
    setInstallPrompt(window.__mainpotInstallPrompt ?? null);

    const handleInstallAvailable = () => {
      setInstallPrompt(window.__mainpotInstallPrompt ?? null);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setInstallAccepted(true);
      setStandalone(true);
      setShowInstallSteps(false);
    };
    window.addEventListener("mainpot:install-available", handleInstallAvailable);
    window.addEventListener("mainpot:installed", handleInstalled);

    void getPushConfig()
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
      window.removeEventListener("mainpot:install-available", handleInstallAvailable);
      window.removeEventListener("mainpot:installed", handleInstalled);
    };
  }, []);

  const available = config?.enabled === true && (pushSupported || (ios && !standalone));
  const installed = standalone || installAccepted;

  useEffect(() => {
    if (!available || deferNudge || subscription || nudgeIsSnoozed()) return;
    const timeout = window.setTimeout(() => {
      if (consumePostGameEntry(game.code)) setExpanded(true);
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [available, deferNudge, game.code, subscription]);

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

  const primaryAction = useMemo(() => {
    if (!installed && ios) return { label: "Show install steps", icon: <Share2 aria-hidden size={16} /> };
    if (!installed && installPrompt) return { label: "Install Mainpot", icon: <Download aria-hidden size={16} /> };
    return { label: "Turn on game alerts", icon: <Bell aria-hidden size={16} /> };
  }, [installed, installPrompt, ios]);

  if (!available || (deferNudge && !subscription)) return null;

  async function handlePrimaryAction() {
    setError(null);

    if (!installed && ios) {
      setShowInstallSteps(true);
      return;
    }

    if (!installed && installPrompt) {
      setBusy(true);
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setInstallAccepted(true);
          setInstallPrompt(null);
          toast("Mainpot installed — turn on alerts when you’re ready.", "success");
        }
      } finally {
        setBusy(false);
      }
      return;
    }

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
                  ? "Install Mainpot and get a quiet alert when someone joins, cash-outs begin, or the final settlement is ready."
                  : "Install Mainpot and get a quiet alert when cash-outs begin or the final settlement is ready."}
            </p>

            {showInstallSteps ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-white/80 p-3.5 text-sm leading-6 text-gray-700">
                <p className="font-semibold text-gray-950">On iPhone or iPad</p>
                <p className="mt-1">
                  Open the browser’s Share menu, choose <strong>Add to Home Screen</strong>, then open Mainpot from the new icon. You’ll be able to turn on alerts there.
                </p>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {subscription ? (
                <Button size="sm" variant="secondary" loading={busy} onClick={handleUnsubscribe}>
                  Turn off alerts
                </Button>
              ) : showInstallSteps ? (
                <Button size="sm" onClick={() => setExpanded(false)}>Got it</Button>
              ) : (
                <Button size="sm" loading={busy} leftIcon={primaryAction.icon} onClick={handlePrimaryAction}>
                  {primaryAction.label}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (!subscription) snoozeNudge();
                  setExpanded(false);
                  setShowInstallSteps(false);
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
