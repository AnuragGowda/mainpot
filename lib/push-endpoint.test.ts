import { describe, expect, it } from "vitest";
import { isTrustedPushEndpoint } from "./push-endpoint";

describe("trusted Web Push destinations", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/device",
    "https://updates.push.services.mozilla.com/wpush/v2/device",
    "https://web.push.apple.com/QDevice",
    "https://wns2-example.notify.windows.com/?token=device",
  ])("accepts browser push service %s", (endpoint) => {
    expect(isTrustedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "https://127.0.0.1/private", "https://[::1]/private", "http://fcm.googleapis.com/send/device",
    "https://169.254.169.254/latest/meta-data", "https://internal.example/private",
    "https://fcm.googleapis.com.attacker.example/send", "https://attacker-fcm.googleapis.com/send",
    "https://fcm.googleapis.com@attacker.example/send", "https://user:password@fcm.googleapis.com/send",
    "https://fcm.googleapis.com:8443/send", "https://fcm.googleapis.com/send#fragment",
    "https://notify.windows.com.attacker.example/send", "https://nested.host.notify.windows.com/send",
    "https://web.push.apple.com./send", "not a URL", null, "",
  ])("rejects untrusted or ambiguous destination %s", (endpoint) => {
    expect(isTrustedPushEndpoint(endpoint)).toBe(false);
  });
});
