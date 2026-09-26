/** The browser-facing origin, without trusting arbitrary forwarded headers. */
export function getRequestOrigin(request: Request): string | null {
  try {
    const url = new URL(request.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = request.headers.get("host");
    if (host === null) return url.origin;
    // A Host authority cannot contain credentials, paths, multiple hosts,
    // escapes, or a nonnumeric port. URL parsing also validates IPv6/ports.
    if (!/^(?:\[[A-Fa-f0-9:.]+\]|[A-Za-z0-9.-]+)(?::[0-9]+)?$/.test(host)) return null;
    const externalUrl = new URL(`${url.protocol}//${host}`);
    if (!externalUrl.hostname.startsWith("[")) {
      const labels = externalUrl.hostname.replace(/\.$/, "").split(".");
      if (labels.some(label => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) return null;
    }
    return externalUrl.origin;
  } catch {
    return null;
  }
}

export function requestIsSameOrigin(request: Request): boolean {
  const expectedOrigin = getRequestOrigin(request);
  const origin = request.headers.get("origin");
  return expectedOrigin !== null && (!origin || origin === expectedOrigin);
}
