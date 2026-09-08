/**
 * Performs a full document navigation for recovery-sensitive transitions.
 * This deliberately reloads the Next.js runtime instead of preserving a
 * possibly stale client bundle across a deployment.
 */
export function navigateToFreshAppPage(path: `/${string}`): void {
  window.location.assign(new URL(path, window.location.origin).href);
}
