"use client";

import { useEffect } from "react";
import type { BeforeInstallPromptEvent } from "@/lib/push-client";

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

export default function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    // Next's development bundles change on every edit. A service worker that
    // caches them can serve an older client bundle alongside freshly rendered
    // HTML, which produces hydration mismatches during local development.
    if (process.env.NODE_ENV === "development") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          if (new URL(registration.scope).pathname === "/") {
            void registration.unregister();
          }
        }
      });
      return;
    }

    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;

    const checkForUpdate = () => {
      if (!disposed) {
        void registration?.update();
      }
    };

    const rememberInstallPrompt = (event: Event) => {
      event.preventDefault();
      window.__mainpotInstallPrompt = event as BeforeInstallPromptEvent;
      window.dispatchEvent(new Event("mainpot:install-available"));
    };

    const clearInstallPrompt = () => {
      delete window.__mainpotInstallPrompt;
      window.dispatchEvent(new Event("mainpot:installed"));
    };

    window.addEventListener("beforeinstallprompt", rememberInstallPrompt);
    window.addEventListener("appinstalled", clearInstallPrompt);

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((nextRegistration) => {
        if (disposed) return;
        registration = nextRegistration;
      })
      .catch((error: unknown) => {
        console.error("Mainpot could not register its offline shell.", error);
      });

    const interval = window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS);
    window.addEventListener("online", checkForUpdate);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("online", checkForUpdate);
      window.removeEventListener("beforeinstallprompt", rememberInstallPrompt);
      window.removeEventListener("appinstalled", clearInstallPrompt);
    };
  }, []);

  return null;
}
