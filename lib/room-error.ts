/** A finite diagnostic code, never the user's raw error or game data. */
export function roomErrorSupportCode(error: Error, version: string): string {
  const detail = error.message.toLowerCase();
  const category = /cannot add.*postgres_changes|subscribe.*multiple|realtime:/.test(detail)
    ? "live-updates"
    : /chunkloaderror|loading chunk|failed to fetch dynamically imported/.test(detail)
      ? "app-files"
      : /quotaexceedederror|storage.*(?:unavailable|denied)|access.*localstorage/.test(detail)
        ? "browser-storage"
        : "room-screen";
  const build = /^[0-9a-f]{7,40}$/.test(version) ? version.slice(0, 7) : "unknown";
  return `mp-${category}-${build}`;
}
