/**
 * Build browser→server `subscribe` messages for session history.
 *
 * Cold open (`lastSeq === 0`) asks for a tail window so large sessions do not
 * force a full replay. Warm/delta (`lastSeq > 0`) stays a plain delta so the
 * server only sends events after the client's cursor.
 *
 * See change: session-tail-rehydrate.
 */
import type { BrowserToServerMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";

export type SessionSubscribeMessage = Extract<
  BrowserToServerMessage,
  { type: "subscribe" }
>;

/** Cold open / full refresh: newest events under the server's default budget. */
export function buildColdTailSubscribe(sessionId: string): SessionSubscribeMessage {
  return { type: "subscribe", sessionId, lastSeq: 0, mode: "tail" };
}

/**
 * Subscribe for a known cursor.
 * - `lastSeq > 0` → delta only (no mode)
 * - `lastSeq === 0` → cold tail
 */
export function buildSessionSubscribe(
  sessionId: string,
  lastSeq: number,
): SessionSubscribeMessage {
  if (lastSeq > 0) {
    return { type: "subscribe", sessionId, lastSeq };
  }
  return buildColdTailSubscribe(sessionId);
}

/** Load older history: exclusive upper bound `seq < fromSeq`. */
export function buildLoadOlderSubscribe(
  sessionId: string,
  fromSeq: number,
): SessionSubscribeMessage {
  return { type: "subscribe", sessionId, fromSeq };
}
