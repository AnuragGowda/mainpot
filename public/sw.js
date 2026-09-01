"use strict";
const SHELL_CACHE = "mainpot-shell-v1";
const ASSET_CACHE = "mainpot-assets-v1";
const OFFLINE_URL = "/offline.html";
const SHELL_ASSETS = [
    OFFLINE_URL,
    "/icon-192x192.png",
    "/icon-512x512.png",
    "/icon-maskable-512x512.png",
    "/apple-touch-icon.png",
];
const serviceWorker = self;
serviceWorker.addEventListener("install", (event) => {
    event.waitUntil(caches
        .open(SHELL_CACHE)
        .then((cache) => cache.addAll(SHELL_ASSETS))
        .then(() => serviceWorker.skipWaiting()));
});
serviceWorker.addEventListener("activate", (event) => {
    event.waitUntil(caches
        .keys()
        .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("mainpot-") &&
        key !== SHELL_CACHE &&
        key !== ASSET_CACHE)
        .map((key) => caches.delete(key))))
        .then(() => serviceWorker.clients.claim()));
});
serviceWorker.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET")
        return;
    if (request.mode === "navigate") {
        event.respondWith(fetch(request).catch(async () => { var _a; return (_a = (await caches.match(OFFLINE_URL))) !== null && _a !== void 0 ? _a : Response.error(); }));
        return;
    }
    const url = new URL(request.url);
    const isStaticAsset = url.origin === serviceWorker.location.origin &&
        (url.pathname.startsWith("/_next/static/") ||
            url.pathname.startsWith("/icon-") ||
            url.pathname === "/apple-touch-icon.png");
    if (!isStaticAsset)
        return;
    event.respondWith(caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fresh = fetch(request)
            .then((response) => {
            if (response.ok) {
                void cache.put(request, response.clone());
            }
            return response;
        })
            .catch(() => cached !== null && cached !== void 0 ? cached : Response.error());
        return cached || fresh;
    }));
});
serviceWorker.addEventListener("message", (event) => {
    var _a;
    if (((_a = event.data) === null || _a === void 0 ? void 0 : _a.type) === "SKIP_WAITING") {
        void serviceWorker.skipWaiting();
    }
});
serviceWorker.addEventListener("push", (event) => {
    if (!event.data)
        return;
    let payload;
    try {
        payload = event.data.json();
    }
    catch (_a) {
        return;
    }
    const title = typeof payload.title === "string" ? payload.title : "Mainpot";
    const options = {
        body: typeof payload.body === "string" ? payload.body : "Your game has an update.",
        icon: typeof payload.icon === "string" ? payload.icon : "/icon-192x192.png",
        badge: typeof payload.badge === "string" ? payload.badge : "/icon-192x192.png",
        tag: typeof payload.tag === "string" ? payload.tag : "mainpot-game-update",
        data: {
            url: typeof payload.url === "string" && payload.url.startsWith("/")
                ? payload.url
                : "/",
        },
    };
    event.waitUntil(serviceWorker.registration.showNotification(title, options));
});
serviceWorker.addEventListener("notificationclick", (event) => {
    var _a;
    event.notification.close();
    const targetUrl = new URL(((_a = event.notification.data) === null || _a === void 0 ? void 0 : _a.url) || "/", serviceWorker.location.origin).href;
    event.waitUntil(serviceWorker.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        const existing = clients.find((client) => client.url === targetUrl);
        if (existing)
            return existing.focus();
        return serviceWorker.clients.openWindow(targetUrl);
    }));
});
