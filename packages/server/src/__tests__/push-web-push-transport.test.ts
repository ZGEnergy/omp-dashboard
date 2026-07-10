/**
 * Unit tests for the Web Push transport (mocked `web-push` library).
 *
 * Asserts: setVapidDetails is configured with mailto+keys, sendNotification is
 * called with the parsed subscription + serialized payload, a 410 maps to
 * `{gone:true}`, and other errors map to `{ok:false}`.
 * See change: add-server-push-notifications.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const setVapidDetails = vi.fn();
const sendNotification = vi.fn();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

import type { PushToken } from "../push/push-token-registry.js";
import type { PushPayload } from "../push/push-transports/types.js";
import { createWebPushTransport } from "../push/push-transports/web-push.js";

const subscription = {
  endpoint: "https://push.example.com/abc",
  keys: { p256dh: "k1", auth: "k2" },
};

function token(): PushToken {
  return {
    id: "t1",
    deviceToken: JSON.stringify(subscription),
    transport: "web-push",
    registeredAt: 0,
    lastUsedAt: 0,
  };
}

const payload: PushPayload = {
  type: "session_attention",
  sessionId: "s1",
  title: "T",
  body: "B",
  url: "/session/s1",
};

describe("web push transport", () => {
  beforeEach(() => {
    setVapidDetails.mockReset();
    sendNotification.mockReset();
  });

  it("configures VAPID details on construction", () => {
    createWebPushTransport({
      vapidKeys: { publicKey: "PUB", privateKey: "PRIV" },
      contactEmail: "ops@example.com",
    });
    expect(setVapidDetails).toHaveBeenCalledWith("mailto:ops@example.com", "PUB", "PRIV");
  });

  it("sends the serialized payload to the parsed subscription and reports ok", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const transport = createWebPushTransport({
      vapidKeys: { publicKey: "PUB", privateKey: "PRIV" },
      contactEmail: "ops@example.com",
    });
    const res = await transport.send(token(), payload);
    expect(res).toEqual({ ok: true });
    expect(sendNotification).toHaveBeenCalledWith(subscription, JSON.stringify(payload));
  });

  it("maps a 410 Gone to { ok:false, gone:true }", async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error("gone"), { statusCode: 410 }));
    const transport = createWebPushTransport({
      vapidKeys: { publicKey: "PUB", privateKey: "PRIV" },
      contactEmail: "ops@example.com",
    });
    const res = await transport.send(token(), payload);
    expect(res).toEqual({ ok: false, gone: true });
  });

  it("maps other errors to { ok:false } without throwing", async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error("boom"), { statusCode: 500 }));
    const transport = createWebPushTransport({
      vapidKeys: { publicKey: "PUB", privateKey: "PRIV" },
      contactEmail: "ops@example.com",
    });
    const res = await transport.send(token(), payload);
    expect(res).toEqual({ ok: false });
  });
});
