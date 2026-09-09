"use client";

import { useEffect, useRef, useState } from "react";
import { Download, SquareArrowUp } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  consumePostGameEntry,
  isIosDevice,
  isStandaloneDisplay,
  PWA_INSTALL_SNOOZE_KEY,
  type BeforeInstallPromptEvent,
} from "@/lib/push-client";

const INSTALL_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function installNudgeIsSnoozed(): boolean {
  try {
    return Number(window.localStorage.getItem(PWA_INSTALL_SNOOZE_KEY)) > Date.now();
  } catch {
    return false;
  }
}

function snoozeInstallNudge(): void {
  try {
    window.localStorage.setItem(
      PWA_INSTALL_SNOOZE_KEY,
      String(Date.now() + INSTALL_SNOOZE_MS),
    );
  } catch {
    // Dismissing the card still works when storage is unavailable.
  }
}

export default function PwaInstallCard({ gameCode }: { gameCode: string }) {
  const { toast } = useToast();
  const entryEligibilityRef = useRef<{ gameCode: string; eligible: boolean } | null>(null);
  const [ios, setIos] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (entryEligibilityRef.current?.gameCode !== gameCode) {
      entryEligibilityRef.current = {
        gameCode,
        eligible: consumePostGameEntry(gameCode),
      };
    }
    if (!entryEligibilityRef.current.eligible || installNudgeIsSnoozed()) return;

    const syncInstallState = () => {
      const nextIos = isIosDevice(
        navigator.userAgent,
        navigator.platform,
        navigator.maxTouchPoints,
      );
      const nextPrompt = window.__mainpotInstallPrompt ?? null;

      setIos(nextIos);
      setInstallPrompt(nextPrompt);
      setVisible(!isStandaloneDisplay() && (nextIos || nextPrompt !== null));
    };
    const handleInstalled = () => {
      setVisible(false);
      setInstallPrompt(null);
    };

    syncInstallState();
    window.addEventListener("mainpot:install-available", syncInstallState);
    window.addEventListener("mainpot:installed", handleInstalled);
    return () => {
      window.removeEventListener("mainpot:install-available", syncInstallState);
      window.removeEventListener("mainpot:installed", handleInstalled);
    };
  }, [gameCode]);

  if (!visible) return null;

  function dismiss() {
    snoozeInstallNudge();
    setVisible(false);
    setShowSteps(false);
  }

  async function handleInstall() {
    if (ios) {
      setShowSteps(true);
      return;
    }
    if (!installPrompt) return;

    setBusy(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      delete window.__mainpotInstallPrompt;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") {
        setVisible(false);
        toast("Mainpot installed — it’s ready for poker night.", "success");
      } else {
        dismiss();
      }
    } catch {
      toast("Mainpot couldn’t open the install prompt. Try again from your browser menu.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="install-mainpot-heading"
      className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-5"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
          Add to your phone
        </p>
        <h2 id="install-mainpot-heading" className="mt-1 text-base font-semibold text-gray-950">
          Keep Mainpot one tap away.
        </h2>
        <p className="mt-1 text-sm leading-6 text-gray-600">
          Add it to your Home Screen for faster access on poker night.
        </p>
        {showSteps ? (
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm leading-6 text-gray-700 ring-1 ring-gray-200">
            <p className="font-semibold text-gray-950">On iPhone or iPad</p>
            <p className="mt-1">
              Tap the browser’s <strong>Share</strong> button, choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
            </p>
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex shrink-0 gap-2 sm:mt-0">
        {showSteps ? (
          <Button size="sm" onClick={dismiss}>Got it</Button>
        ) : (
          <Button
            size="sm"
            loading={busy}
            leftIcon={ios ? <SquareArrowUp aria-hidden size={16} /> : <Download aria-hidden size={16} />}
            onClick={() => void handleInstall()}
          >
            {ios ? "Show me how" : "Install Mainpot"}
          </Button>
        )}
        {!showSteps ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={dismiss}>
            Not now
          </Button>
        ) : null}
      </div>
    </section>
  );
}
