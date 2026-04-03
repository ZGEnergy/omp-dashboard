/**
 * Subscription message handlers: subscribe, unsubscribe.
 */
import type { WebSocket } from "ws";
import type { ServerToBrowserMessage, BrowserToServerMessage } from "../../shared/browser-protocol.js";
import type { BrowserHandlerContext } from "./handler-context.js";
import { extractStatsFromEvents } from "../event-status-extraction.js";

const REPLAY_BATCH_SIZE = 200;

export function handleSubscribe(
  msg: Extract<BrowserToServerMessage, { type: "subscribe" }>,
  subs: Set<string>,
  ctx: BrowserHandlerContext,
): void {
  const { ws, sessionManager, eventStore, directoryService, sendTo, broadcast, getSubscribers, replayPendingUiRequests } = ctx;
  subs.add(msg.sessionId);

  if (eventStore.hasEvents(msg.sessionId)) {
    const events = eventStore.getEvents(msg.sessionId, (msg.lastSeq ?? 0) + 1);
    for (let i = 0; i < events.length; i += REPLAY_BATCH_SIZE) {
      const batch = events.slice(i, i + REPLAY_BATCH_SIZE);
      sendTo(ws, {
        type: "event_replay",
        sessionId: msg.sessionId,
        events: batch.map((e) => ({ seq: e.seq, event: e.event })),
        isLast: i + REPLAY_BATCH_SIZE >= events.length,
      });
    }
    replayPendingUiRequests(ws, msg.sessionId);
  } else if (directoryService) {
    const session = sessionManager.get(msg.sessionId);
    if (session?.sessionFile) {
      sendTo(ws, {
        type: "event_replay",
        sessionId: msg.sessionId,
        events: [],
        isLast: false,
      });
      directoryService.loadSessionEvents(msg.sessionId, session.sessionFile).then((result) => {
        if (result.success) {
          for (const evt of result.events) {
            eventStore.insertEvent(msg.sessionId, evt);
          }
          const statsUpdates = extractStatsFromEvents(result.events);
          const metaUpdates: Record<string, unknown> = { dataUnavailable: false, ...statsUpdates };
          sessionManager.update(msg.sessionId, metaUpdates);
          broadcast({ type: "session_updated", sessionId: msg.sessionId, updates: metaUpdates });
          const stored = eventStore.getEvents(msg.sessionId, 1);
          const replayMsg: ServerToBrowserMessage = {
            type: "event_replay",
            sessionId: msg.sessionId,
            events: stored.map((e) => ({ seq: e.seq, event: e.event })),
            isLast: true,
          };
          for (const sub of getSubscribers(msg.sessionId)) {
            sendTo(sub, replayMsg);
            replayPendingUiRequests(sub, msg.sessionId);
          }
        } else {
          sendTo(ws, { type: "event_replay", sessionId: msg.sessionId, events: [], isLast: true });
          sessionManager.update(msg.sessionId, { dataUnavailable: true });
          broadcast({ type: "session_updated", sessionId: msg.sessionId, updates: { dataUnavailable: true } });
        }
      }).catch(() => {
        sendTo(ws, { type: "event_replay", sessionId: msg.sessionId, events: [], isLast: true });
        sessionManager.update(msg.sessionId, { dataUnavailable: true });
        broadcast({ type: "session_updated", sessionId: msg.sessionId, updates: { dataUnavailable: true } });
      });
    } else {
      sendTo(ws, { type: "event_replay", sessionId: msg.sessionId, events: [], isLast: true });
      if (session) {
        sessionManager.update(msg.sessionId, { dataUnavailable: true });
        broadcast({ type: "session_updated", sessionId: msg.sessionId, updates: { dataUnavailable: true } });
      }
    }
  } else {
    sendTo(ws, { type: "event_replay", sessionId: msg.sessionId, events: [], isLast: true });
  }
}
