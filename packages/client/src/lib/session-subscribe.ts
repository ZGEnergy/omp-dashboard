import type { BrowserToServerMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";

export type SessionSubscribeMessage = Extract<BrowserToServerMessage, { type: "subscribe" }>;

let requestSequence = 0;

/** Injectable only for deterministic tests; production uses crypto UUIDs. */
export function mintReplayRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  requestSequence += 1;
  return `replay-${Date.now().toString(36)}-${requestSequence.toString(36)}`;
}

function subscribe(
  sessionId: string,
  fields: Omit<SessionSubscribeMessage, "type" | "sessionId" | "requestId">,
  knownSourceGeneration?: string,
): SessionSubscribeMessage {
  return {
    type: "subscribe",
    sessionId,
    requestId: mintReplayRequestId(),
    ...(knownSourceGeneration ? { knownSourceGeneration } : {}),
    ...fields,
  };
}

/** Cold open asks for the newest byte-bounded tail under a fresh correlation id. */
export function buildColdTailSubscribe(sessionId: string, knownSourceGeneration?: string): SessionSubscribeMessage {
  return subscribe(sessionId, { lastSeq: 0, mode: "tail" }, knownSourceGeneration);
}

/** A positive contiguous cursor requests a delta; zero asks for cold tail. */
export function buildSessionSubscribe(
  sessionId: string,
  lastSeq: number,
  knownSourceGeneration?: string,
): SessionSubscribeMessage {
  return lastSeq > 0
    ? subscribe(sessionId, { lastSeq }, knownSourceGeneration)
    : buildColdTailSubscribe(sessionId, knownSourceGeneration);
}

/** Load an exclusive older page, preserving the caller's anchor token separately. */
export function buildLoadOlderSubscribe(
  sessionId: string,
  fromSeq: number,
  knownSourceGeneration?: string,
): SessionSubscribeMessage {
  return subscribe(sessionId, { fromSeq }, knownSourceGeneration);
}
