/**
 * FCM transport — TYPED STUB for v1.
 *
 * The `transport: "fcm"` union member is kept intact across types/registry/
 * config so the later Capacitor mobile-shell change can drop in the real
 * JWT-signing + HTTP/2 delivery (tasks.md section 5) without touching the
 * dispatcher, registry, or call site. In v1 `send` throws so any accidental
 * FCM dispatch is loud rather than silently dropped.
 * See change: add-server-push-notifications (deferred: add-capacitor-mobile-shell).
 */
import type { PushToken } from "../push-token-registry.js";
import type { PushPayload, PushSendResult, PushTransport } from "./types.js";

export interface FcmTransportOptions {
  serviceAccountPath: string;
}

export function createFcmTransport(_opts: FcmTransportOptions): PushTransport {
  return {
    kind: "fcm",
    async send(_token: PushToken, _payload: PushPayload): Promise<PushSendResult> {
      throw new Error("fcm transport not implemented — see add-capacitor-mobile-shell");
    },
  };
}
