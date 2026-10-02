export interface ReadLifecycleEvent {
  at: number;
  device: number;
  event: string;
  document: number;
  path?: string;
  name?: string;
  method?: string;
  status?: number;
}

/** WebKit emits native fetch console diagnostics as Playwright pageerrors. */
export function isHandledNavigationReadError(
  error: { at: number; device: number; navigation: number | null },
  nativePath: string | null,
  lifecycle: ReadLifecycleEvent[],
): boolean {
  // The installed SDK and payment reader catch these transport rejections. Require
  // evidence from the departing document, never just a native-looking message.
  if (!["/auth/v1/user", "/rest/v1/settlement_payments"].includes(nativePath ?? "") || error.navigation === null) return false;
  return lifecycle.some(rejection => {
    if (rejection.device !== error.device || rejection.event !== "fetch-rejected"
      || rejection.path !== nativePath || rejection.name !== "TypeError"
      || !["GET", "HEAD"].includes(rejection.method ?? "")
      || Math.abs(rejection.at - error.at) > 50) return false;
    const events = lifecycle.filter(event => event.device === error.device);
    if (events.some(event => event.document === rejection.document
      && (event.event === "window-error" || event.event === "unhandled-rejection"))) return false;
    return events.some(hidden => hidden.event === "pagehide" && hidden.document === rejection.document
      && Math.abs(hidden.at - error.at) <= 250
      && events.some(shown => shown.event === "pageshow" && shown.document !== hidden.document
        && shown.at >= hidden.at && shown.at - hidden.at <= 1_000
        && events.some(read => read.event === "fetch-completed" && read.document === shown.document
          && read.path === nativePath && read.status === 200
          && ["GET", "HEAD"].includes(read.method ?? "")
          && read.at >= hidden.at && read.at - shown.at <= 5_000)));
  });
}
