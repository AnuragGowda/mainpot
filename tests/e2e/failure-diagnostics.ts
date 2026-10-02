import type { Page } from "@playwright/test";
import { isHandledNavigationReadError, type ReadLifecycleEvent } from "./navigation-fetch-errors";

export function failureDiagnostics(pages: Page[]) {
  type Request = import("@playwright/test").Request;
  const started = performance.now();
  const at = () => Math.round(performance.now() - started);
  const safeText = (text: string) => text
    .replace(/https?:\/\/[^\s"'<>]+/g, value => {
      try { return `[URL ${new URL(value).pathname}]`; } catch { return "[URL]"; }
    }).replace(/\?[^\s"'<>]+/g, "?[redacted]");
  const nativeURL = (error: Error) => {
    const protocol = /^Fetch API cannot load (https?)$/.exec(error.name)?.[1];
    const suffix = " due to access control checks.";
    if (!protocol || !error.message.endsWith(suffix)) return null;
    try { return new URL(`${protocol}:/${error.message.slice(0, -suffix.length)}`).href; } catch { return null; }
  };
  const safeOrigin = (value: string | undefined) => {
    if (value === undefined) return null;
    if (value === "*" || value === "null") return value;
    try {
      const url = new URL(value);
      return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ? url.origin : `[other origin ${url.pathname}]`;
    } catch { return "[invalid origin]"; }
  };
  let phase = "setup";
  let nextRequest = 0;
  let nextNavigation = 0;
  const epochs = pages.map(() => 0);
  const documents = new Map<Page, number>();
  const retiredReads: { request: number; device: number; path: string; fromDocument: number; toDocument: number }[] = [];
  const navigation = new Map<Page, number>();
  const requests = new WeakMap<Request, { id: number; epoch: number; phase: string; at: number; document?: number }>();
  const statuses = new WeakMap<Request, number>();
  // Routed fetch/fulfill work is independent of browser networkidle. Require
  // both lifecycles to finish, then remain quiet before replacing a document.
  const activity = new Map(pages.map(page => [page, {
    requests: new Set<Request>(), handlers: 0, lastActivity: performance.now(), watchers: new Set<() => void>(),
  }]));
  const changed = (page: Page) => {
    const state = activity.get(page)!;
    state.lastActivity = performance.now();
    for (const watcher of state.watchers) watcher();
  };
  const waitForReads = (page: Page) => new Promise<void>((resolve, reject) => {
    const state = activity.get(page)!;
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => {
      clearTimeout(deadline);
      if (quietTimer) clearTimeout(quietTimer);
      state.watchers.delete(check);
      if (error) reject(error); else resolve();
    };
    const check = () => {
      if (quietTimer) clearTimeout(quietTimer);
      if (state.requests.size || state.handlers) return;
      const remaining = 250 - (performance.now() - state.lastActivity);
      if (remaining <= 0) finish();
      else quietTimer = setTimeout(check, remaining);
    };
    const deadline = setTimeout(() => finish(new Error(
      `Read quiescence not reached within 15 seconds: ${state.requests.size} browser requests, ${state.handlers} route handlers. Pending: ${Array.from(state.requests).map(request => {
        const meta = requests.get(request);
        return `${request.method()} ${new URL(request.url()).pathname} (${request.resourceType()}, status ${statuses.get(request) ?? "none"}, ${meta ? at() - meta.at : "unknown"}ms, epoch ${meta?.epoch ?? "unknown"}/${epochs[pages.indexOf(page)]}, started in ${meta?.phase ?? "unknown"})`;
      }).join("; ")}`,
    )), 15_000);
    state.watchers.add(check);
    check();
  });
  const duringRoute = async <T>(page: Page, action: () => Promise<T>): Promise<T> => {
    const state = activity.get(page)!;
    state.handlers += 1;
    changed(page);
    try { return await action(); } finally { state.handlers -= 1; changed(page); }
  };
  const errorURLs: (string | null)[] = [];
  const failedURLs: string[] = [];
  const runtimeErrors: { device: number; phase: string; at: number; epoch: number; navigation: number | null; name: string; message: string; stackPresent: boolean }[] = [];
  const failedRequests: { device: number; phase: string; at: number; epoch: number; navigation: number | null; request: number | null; startedPhase: string | null; startedAt: number | null; path: string; method: string; resource: string; status: number | null; category: string; error: string | null }[] = [];
  const responses: { device: number; request: number | null; at: number; phase: string; path: string; status: number; origin: string | null; allowOrigin: string | null; allowCredentials: string | null }[] = [];
  let omittedResponses = 0;
  const transitions: { at: number; phase: string; device?: number; navigation?: number; event?: string; epoch?: number; activeRequests?: number; activeHandlers?: number; quietFor?: number }[] = [];
  const lifecycle: (ReadLifecycleEvent & { phase: string })[] = [];
  const ready = Promise.all(pages.map(async (page, device) => {
    await page.exposeBinding("__mainpotDocumentReady", (source, documentId: number) => {
      if (source.frame !== page.mainFrame()) return;
      const previous = documents.get(page);
      documents.set(page, documentId);
      if (previous === undefined || previous === documentId) return;
      // New-document fetches await this binding acknowledgement, so their
      // request events cannot be tagged with the previous document's token.
      for (const request of activity.get(page)!.requests) {
        const meta = requests.get(request)!;
        const path = new URL(request.url()).pathname;
        const isRead = ["GET", "HEAD"].includes(request.method())
          || (request.method() === "POST" && path === "/rest/v1/rpc/get_game_by_code");
        if (meta.document !== previous || !isRead
          || request.resourceType() !== "fetch" || request.frame() !== page.mainFrame()) continue;
        activity.get(page)!.requests.delete(request);
        retiredReads.push({ request: meta.id, device, path, fromDocument: previous, toDocument: documentId });
        changed(page);
      }
    });
    await page.addInitScript(() => {
    if (window !== window.top) return;
    const documentId = performance.timeOrigin;
    const documentReady = (window as unknown as {
      __mainpotDocumentReady: (documentId: number) => Promise<void>;
    }).__mainpotDocumentReady(documentId);
    const log = (event: string, detail: Record<string, unknown> = {}) =>
      console.info("[read-lifecycle]", JSON.stringify({ event, document: documentId, ...detail }));
    log("document-started");
    window.addEventListener("pagehide", () => log("pagehide"));
    window.addEventListener("pageshow", () => log("pageshow"));
    window.addEventListener("error", () => log("window-error"));
    window.addEventListener("unhandledrejection", () => log("unhandled-rejection"));
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : String(input), location.href).pathname;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      try {
        await documentReady;
        const response = await originalFetch(input, init);
        if (path === "/auth/v1/user" || path === "/rest/v1/settlement_payments") log("fetch-completed", { path, method, status: response.status });
        return response;
      } catch (error) {
        log("fetch-rejected", { path, method, name: error instanceof Error ? error.name : "unknown" });
        throw error;
      }
    };
    });
  }));
  const setPhase = (value: string) => { phase = value; transitions.push({ at: at(), phase }); };
  pages.forEach((page, device) => {
    page.on("console", message => {
      const prefix = "[read-lifecycle] ";
      if (!message.text().startsWith(prefix)) return;
      try {
        const entry = JSON.parse(message.text().slice(prefix.length)) as ReadLifecycleEvent;
        if (typeof entry.event !== "string" || typeof entry.document !== "number") return;
        lifecycle.push({ at: at(), device, phase, event: entry.event, document: entry.document,
          path: typeof entry.path === "string" ? entry.path : undefined,
          name: typeof entry.name === "string" ? entry.name : undefined,
          method: typeof entry.method === "string" ? entry.method : undefined,
          status: typeof entry.status === "number" ? entry.status : undefined });
      } catch { /* Unrecognized diagnostics cannot classify a browser error. */ }
    });
    page.on("framenavigated", frame => {
      if (frame === page.mainFrame()) {
        epochs[device] += 1;
        // This includes same-document history navigation. Lifecycle document
        // IDs, rather than frame epochs, establish actual document replacement.
        transitions.push({ at: at(), phase, device, event: "frame-navigated", epoch: epochs[device] });
      }
    });
    page.on("request", request => {
      const requestedAt = at();
      requests.set(request, { id: ++nextRequest, epoch: epochs[device], phase, at: requestedAt, document: documents.get(page) });
      if (/^https?:/.test(request.url())) { activity.get(page)!.requests.add(request); changed(page); }
    });
    const complete = (request: Request) => {
      if (activity.get(page)!.requests.delete(request)) changed(page);
    };
    page.on("requestfinished", complete);
    page.on("requestfailed", complete);
    page.on("response", response => {
      const request = response.request();
      statuses.set(request, response.status());
      const path = new URL(request.url()).pathname;
      if (path !== "/auth/v1/user" && path !== "/rest/v1/settlement_payments" && path !== "/rest/v1/rpc/get_game_by_code") return;
      const headers = response.headers();
      const credentials = headers["access-control-allow-credentials"];
      responses.push({ device, request: requests.get(request)?.id ?? null, at: at(), phase, path, status: response.status(),
        origin: safeOrigin(request.headers().origin), allowOrigin: safeOrigin(headers["access-control-allow-origin"]),
        allowCredentials: credentials === undefined ? null : credentials === "true" ? "true" : "[unexpected]" });
      if (responses.length > 100) { responses.shift(); omittedResponses += 1; }
    });
    page.on("pageerror", error => {
      const url = nativeURL(error);
      errorURLs.push(url);
      runtimeErrors.push({ device, phase, at: at(), epoch: epochs[device], navigation: navigation.get(page) ?? null,
        name: safeText(error.name), message: url ? `Fetch API cannot load [URL ${new URL(url).pathname}] due to access control checks.` : safeText(error.message), stackPresent: Boolean(error.stack) });
    });
    page.on("requestfailed", request => {
      const meta = requests.get(request);
      const error = request.failure()?.errorText ?? null;
      failedURLs.push(request.url());
      failedRequests.push({ device, phase, at: at(), epoch: meta?.epoch ?? epochs[device], navigation: navigation.get(page) ?? null,
        request: meta?.id ?? null, startedPhase: meta?.phase ?? null, startedAt: meta?.at ?? null,
        path: new URL(request.url()).pathname, method: request.method(), resource: request.resourceType(), status: statuses.get(request) ?? null,
        category: error === "net::ERR_ABORTED" ? "aborted" : /access control|cors/i.test(error ?? "") ? "access-control" : "other", error: error ? safeText(error) : null });
    });
  });
  const navigate = async (page: Page, label: string, action: () => Promise<unknown>) => {
    const device = pages.indexOf(page);
    setPhase(`${label}: waiting for reads`);
    await waitForReads(page);
    const state = activity.get(page)!;
    transitions.push({ at: at(), phase, device, event: "read-quiescent", activeRequests: state.requests.size,
      activeHandlers: state.handlers, quietFor: Math.floor(performance.now() - state.lastActivity) });
    const id = ++nextNavigation;
    setPhase(label);
    navigation.set(page, id);
    transitions.push({ at: at(), phase, device, navigation: id, event: "navigation-start", epoch: epochs[device] });
    try { await action(); } finally {
      transitions.push({ at: at(), phase, device, navigation: id, event: "navigation-end", epoch: epochs[device] });
      navigation.delete(page);
    }
  };
  const handledNavigationErrors = () => runtimeErrors.flatMap((error, index) =>
    isHandledNavigationReadError(error, errorURLs[index] ? new URL(errorURLs[index]!).pathname : null, lifecycle)
      ? [{ error: index, category: "handled-navigation-read-transport" }] : []);
  const unhandledErrors = () => {
    const handled = new Set(handledNavigationErrors().map(entry => entry.error));
    return [...runtimeErrors.filter((_error, index) => !handled.has(index)),
      ...lifecycle.filter(event => event.event === "window-error" || event.event === "unhandled-rejection")];
  };
  const report = () => ({ runtimeErrors, handledNavigationErrors: handledNavigationErrors(), retiredReads, failedRequests, responses, omittedResponses, transitions, lifecycle,
    // Exact URLs stay private. Candidate IDs expose whether one request supports
    // cancellation; matching alone never suppresses an error or proves its cause.
    correlations: runtimeErrors.map((error, index) => ({ error: index,
      failedRequests: failedRequests.filter((failure, failedIndex) => errorURLs[index] !== null
        && errorURLs[index] === failedURLs[failedIndex] && error.device === failure.device
        && Math.abs(error.at - failure.at) <= 250).map(failure => failure.request) })) });
  return { ready, runtimeErrors, unhandledErrors, setPhase, navigate, duringRoute, report };
}
