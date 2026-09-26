import { describe, expect, it } from "vitest";
import { getRequestOrigin, requestIsSameOrigin } from "./request-origin";

function request(host?: string, origin?: string) {
  return new Request("http://localhost:3110/api/test", {
    headers: { ...(host !== undefined ? { host } : {}), ...(origin !== undefined ? { origin } : {}), "x-forwarded-host": "untrusted.example" },
  });
}

describe("browser-facing request origin", () => {
  it.each(["127.0.0.1:3110", "preview.mainpot.app:3110", "www.mainpot.app:3110", "[::1]:3110"])("preserves host %s and ignores forwarded headers", host => {
    expect(getRequestOrigin(request(host))).toBe(`http://${host}`);
    expect(requestIsSameOrigin(request(host, `http://${host}`))).toBe(true);
    expect(requestIsSameOrigin(request(host, "http://untrusted.example"))).toBe(false);
  });

  it.each(["", "example.com/path", "user@example.com", "example.com,evil.example", "example.com:invalid", "example.com:99999", "example.com:", "example.com?next=evil", "-example.com", "example..com"])("rejects malformed host %s", host => {
    expect(getRequestOrigin(request(host))).toBeNull();
    expect(requestIsSameOrigin(request(host))).toBe(false);
  });

  it("uses the request URL when no Host header is present", () => {
    expect(getRequestOrigin(request())).toBe("http://localhost:3110");
  });
});
