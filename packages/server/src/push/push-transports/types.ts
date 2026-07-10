/**
 * Shared push-transport contract.
 *
 * Every transport (Web Push, FCM, future APNs-direct) implements
 * `PushTransport`. The dispatcher keys transports by `token.transport` and is
 * agnostic to which concrete adapter serves a token — adding a transport is a
 * new file here plus a registry entry, nothing else.
 * See change: add-server-push-notifications.
 */
import type { PushToken } from "../push-token-registry.js";

/** Transport discriminator. Kept as a union so FCM drops in without churn. */
export type PushTransportKind = "web-push" | "fcm";

/**
 * Small, link-only notification payload. Title/body computed server-side from
 * the event + session; `url` deep-links to the session. Kept under the 4 KB
 * Web Push / FCM payload ceiling. See design Decision 5.
 */
export interface PushPayload {
  type: "session_attention";
  sessionId: string;
  title: string;
  body: string;
  url: string;
}

/**
 * Result of a single send.
 * - `ok`: delivery accepted by the push service.
 * - `gone`: the subscription/token is permanently dead (Web Push `410`,
 *   FCM `NOT_FOUND` / `UNREGISTERED`) — the dispatcher prunes it.
 */
export interface PushSendResult {
  ok: boolean;
  gone?: boolean;
}

export interface PushTransport {
  kind: PushTransportKind;
  send(token: PushToken, payload: PushPayload): Promise<PushSendResult>;
}
