import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendNotification: vi.fn(), setVapidDetails: vi.fn() }));
vi.mock("web-push", () => ({ default: mocks }));
import { sendWebPush } from "./push-server";

describe("push delivery destination enforcement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks a malicious subscription stored through the Data API before any network call", async () => {
    await expect(sendWebPush({ endpoint: "https://127.0.0.1/internal", p256dh: "key", auth: "auth" }, {}, 60))
      .rejects.toThrow("Untrusted push subscription endpoint");
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it("sends a stored browser push service subscription", async () => {
    const subscription = { endpoint: "https://web.push.apple.com/device", p256dh: "key", auth: "auth" };
    await sendWebPush(subscription, { title: "Game ready" }, 60);
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      { endpoint: subscription.endpoint, keys: { p256dh: "key", auth: "auth" } },
      JSON.stringify({ title: "Game ready" }), { TTL: 60, urgency: "normal" },
    );
  });
});
