"use strict";

const recoveryButton = document.getElementById("recover");
const recoveryStatus = document.getElementById("status");
const requestedCode = new URL(window.location.href).searchParams.get("game")?.toUpperCase();
let savedCode = null;
try {
  savedCode = window.localStorage.getItem("ante_active_game");
} catch {
  // A supplied room code also works when browser storage is unavailable.
}
const recoveryCode = [requestedCode, savedCode].find((code) => typeof code === "string" && /^[A-Z0-9]{6}$/.test(code));

recoveryButton.addEventListener("click", async () => {
  recoveryButton.disabled = true;
  recoveryStatus.textContent = "Refreshing Mainpot…";
  try {
    // Remove only Mainpot app caches. Auth cookies and ledger storage stay intact.
    if ("caches" in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("mainpot-")).map((key) => window.caches.delete(key)));
    }
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter((registration) => new URL(registration.scope).pathname === "/").map((registration) => registration.unregister()));
    }
    const target = new URL(recoveryCode ? `/game/${recoveryCode}` : "/create", window.location.origin);
    target.searchParams.set("recovery", String(Date.now()));
    window.location.replace(target.href);
  } catch {
    recoveryStatus.textContent = "Could not refresh the app files. Check your connection, then try again.";
    recoveryButton.disabled = false;
  }
});
