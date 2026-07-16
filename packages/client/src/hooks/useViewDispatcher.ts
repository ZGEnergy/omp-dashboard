import { useEffect, useRef } from "react";
import type { ConnectionStatus } from "./useWebSocket.js";

function isDocumentVisible(): boolean {
  return document.visibilityState !== "hidden";
}

/**
 * Dispatches `session_view` / `session_unview` messages to the server based
 * on the currently-viewed session id, with re-send semantics on WebSocket
 * (re)connect.
 *
 * Lifecycle rules:
 *   1. A session is advertised as viewed only while the page is visible.
 *   2. Session changes send `session_unview` for the previous id, then a
 *      visible-page `session_view` for the new id.
 *   3. Visibility changes release the view while backgrounded and restore it
 *      on return, so a backgrounded PWA remains eligible for push.
 *   4. On every transition of `connectionStatus` INTO "connected", re-send
 *      `session_view` only when the page is visible.
 *
 * Network-level send-or-not is the caller's concern via the `send` function
 * (it's expected to silently drop sends while the socket is not OPEN — the
 * reconnect re-send rule handles the recovery).
 *
 * See change: session-card-unread-stripes.
 */
export interface UseViewDispatcherDeps {
  viewedSessionId: string | null;
  connectionStatus: ConnectionStatus;
  send: (msg: { type: "session_view" | "session_unview"; sessionId: string }) => void;
}

export function useViewDispatcher(deps: UseViewDispatcherDeps): void {
  const { viewedSessionId, connectionStatus, send } = deps;

  const previousIdRef = useRef<string | null>(null);
  const previousStatusRef = useRef<ConnectionStatus | null>(null);

  // Effect 1: react to viewedSessionId transitions
  useEffect(() => {
    const prev = previousIdRef.current;
    const next = viewedSessionId;

    if (prev !== next) {
      if (prev !== null) {
        send({ type: "session_unview", sessionId: prev });
      }
      if (next !== null && isDocumentVisible()) {
        send({ type: "session_view", sessionId: next });
      }
    }

    previousIdRef.current = next;
  }, [viewedSessionId, send]);

  // Effect 2: re-send session_view on every (re)connect
  useEffect(() => {
    const prevStatus = previousStatusRef.current;
    if (connectionStatus === "connected" && prevStatus !== "connected" && isDocumentVisible()) {
      // Just (re)connected. Re-publish the current visible view so the
      // server-side viewed-session map matches reality.
      const id = previousIdRef.current;
      if (id !== null) send({ type: "session_view", sessionId: id });
    }
    previousStatusRef.current = connectionStatus;
  }, [connectionStatus, send]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const id = previousIdRef.current;
      if (id === null) return;
      if (isDocumentVisible()) {
        if (connectionStatus === "connected") send({ type: "session_view", sessionId: id });
      } else {
        send({ type: "session_unview", sessionId: id });
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [connectionStatus, send]);
}
