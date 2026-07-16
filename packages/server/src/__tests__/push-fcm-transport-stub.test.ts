/**
 * The FCM transport is a typed stub in v1 — `send` must reject with the
 * deferral message so any accidental dispatch is loud.
 * See change: add-server-push-notifications.
 */
import { describe, expect, it } from "vitest";
import type { PushToken } from "../push/push-token-registry.js";
import { createFcmTransport } from "../push/push-transports/fcm.js";
import type { PushPayload } from "../push/push-transports/types.js";

describe("FCM transport stub", () => {
  it("has kind 'fcm' and rejects send with the deferral message", async () => {
    const transport = createFcmTransport({ serviceAccountPath: "/tmp/fcm.json" });
    expect(transport.kind).toBe("fcm");
    const token: PushToken = {
      id: "t1",
      deviceToken: "fcm-token",
      transport: "fcm",
      registeredAt: 0,
      lastUsedAt: 0,
    };
    const payload: PushPayload = {
      type: "session_attention",
      sessionId: "s1",
      title: "T",
      body: "B",
      url: "/session/s1",
    };
    await expect(transport.send(token, payload)).rejects.toThrow(
      "fcm transport not implemented — see add-capacitor-mobile-shell",
    );
  });
});
