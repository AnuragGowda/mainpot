"use client";

import { useEffect } from "react";

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

export default function PwaRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }

    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;

    const checkForUpdate = () => {
      if (!disposed) {
        void registration?.update();
      }
    };

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
    };
  }, []);

  return null;
}
