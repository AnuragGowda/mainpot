/** Browser push services are the only destinations for server push delivery. */
export function isTrustedPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 12 || value.length > 2048) return false;
  try {
    const endpoint = new URL(value);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password
      || endpoint.port || endpoint.hash) return false;
    const host = endpoint.hostname;
    return host === "fcm.googleapis.com"
      || host === "updates.push.services.mozilla.com"
      || host === "web.push.apple.com"
      || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
  } catch {
    return false;
  }
}
