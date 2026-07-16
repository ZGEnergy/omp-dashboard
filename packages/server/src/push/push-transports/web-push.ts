/**
 * Web Push (W3C) transport via VAPID.
 *
 * Uses the `web-push` library: `setVapidDetails` once at construction, then
 * `sendNotification(subscription, JSON.stringify(payload))` per send. The
 * device token is the JSON-serialized `PushSubscription` the browser produced.
 *
 * On `410 Gone` the subscription is permanently dead → `{ok:false, gone:true}`
 * so the dispatcher prunes it. Other errors are logged and reported as
 * `{ok:false}` (no retry in v1 — the transport layer already retries).
 * See change: add-server-push-notifications.
 */
import webpush from "web-push";
import type { PushToken } from "../push-token-registry.js";
import type { PushPayload, PushSendResult, PushTransport } from "./types.js";

export interface WebPushTransportOptions {
  vapidKeys: { publicKey: string; privateKey: string };
  contactEmail: string;
}

export function createWebPushTransport(opts: WebPushTransportOptions): PushTransport {
  const { vapidKeys, contactEmail } = opts;
  webpush.setVapidDetails(`mailto:${contactEmail}`, vapidKeys.publicKey, vapidKeys.privateKey);

  return {
    kind: "web-push",
    async send(token: PushToken, payload: PushPayload): Promise<PushSendResult> {
      let subscription: webpush.PushSubscription;
      try {
        subscription = JSON.parse(token.deviceToken) as webpush.PushSubscription;
      } catch {
        console.error(`[web-push] malformed subscription for token ${token.id}`);
        return { ok: false };
      }
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        return { ok: true };
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          return { ok: false, gone: true };
        }
        console.error(`[web-push] send failed for token ${token.id} (status ${typeof statusCode === "number" ? statusCode : "unknown"})`);
        return { ok: false };
      }
    },
  };
}
