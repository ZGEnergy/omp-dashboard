import { setSender as setPluginActionSender } from "@blackbelt-technology/dashboard-plugin-runtime";
import type { BrowserToServerMessage, ServerToBrowserMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBase } from "../lib/api/api-context.js";
import { appendWsTicket, getDeviceBearer, mintWsTicket } from "../lib/pairing/device-auth.js";

export type ConnectionStatus = "connected" | "connecting" | "offline" | "auth_required";

const OFFLINE_THRESHOLD = 3;

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [serverEpoch, setServerEpoch] = useState<string | null>(null);
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const handlersRef = useRef<((msg: ServerToBrowserMessage) => void)[]>([]);
  const reconnectTimerRef = useRef<{
    epoch: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const backoffRef = useRef(1000);
  const failCountRef = useRef(0);
  const connectionEpochRef = useRef(0);
  const foregroundReconnectPendingRef = useRef(false);
  // Holds the latest `connect` so reconnect timers always re-run the current
  // URL's ticket-minting path instead of a stale closure.
  const connectRef = useRef<(foreground: boolean) => void>(() => {});

  const clearReconnectTimer = useCallback(() => {
    const reconnect = reconnectTimerRef.current;
    reconnectTimerRef.current = null;
    if (reconnect) clearTimeout(reconnect.timer);
  }, []);

  const closeCurrentSocket = useCallback(() => {
    const socket = wsRef.current;
    wsRef.current = null;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.close();
  }, []);

  const invalidateConnection = useCallback(() => {
    const epoch = ++connectionEpochRef.current;
    clearReconnectTimer();
    closeCurrentSocket();
    setConnectionEpoch(epoch);
    setServerEpoch(null);
    return epoch;
  }, [clearReconnectTimer, closeCurrentSocket]);

  const openSocket = useCallback((finalUrl: string, epoch: number) => {
    if (connectionEpochRef.current !== epoch) return;

    let socket: WebSocket;
    try {
      socket = new WebSocket(finalUrl);
    } catch {
      if (connectionEpochRef.current !== epoch) return;
      foregroundReconnectPendingRef.current = false;
      failCountRef.current++;
      if (failCountRef.current >= OFFLINE_THRESHOLD) {
        setStatus("offline");
      } else {
        setStatus("connecting");
      }
      return;
    }

    if (connectionEpochRef.current !== epoch) {
      socket.close();
      return;
    }
    wsRef.current = socket;

    const isAuthoritative = () => connectionEpochRef.current === epoch && wsRef.current === socket;

    socket.onopen = () => {
      if (!isAuthoritative()) return;
      foregroundReconnectPendingRef.current = false;
      setStatus("connected");
      backoffRef.current = 1000;
      failCountRef.current = 0;
    };

    socket.onmessage = (ev) => {
      if (!isAuthoritative()) return;
      try {
        const msg = JSON.parse(ev.data) as ServerToBrowserMessage;
        if (!isAuthoritative()) return;
        if (msg.type === "sessions_snapshot" && typeof msg.serverEpoch === "string") {
          setServerEpoch(msg.serverEpoch);
        }
        for (const handler of handlersRef.current) {
          if (!isAuthoritative()) break;
          handler(msg);
        }
      } catch {
        // Ignore malformed messages and handler failures, matching the existing
        // non-replay behavior.
      }
    };

    socket.onclose = () => {
      if (!isAuthoritative()) return;
      wsRef.current = null;
      failCountRef.current++;
      if (failCountRef.current >= OFFLINE_THRESHOLD) {
        // Check if it's an auth issue before marking as offline. The request
        // belongs to this connection epoch and must not update a successor.
        fetch(`${getApiBase()}/auth/status`)
          .then((res) => res.json())
          .then((data) => {
            if (connectionEpochRef.current !== epoch) return;
            if (data.authenticated === false) {
              setStatus("auth_required");
            } else {
              setStatus("offline");
            }
          })
          .catch(() => {
            if (connectionEpochRef.current === epoch) setStatus("offline");
          });
      } else {
        setStatus("connecting");
      }

      const timer = setTimeout(() => {
        const reconnect = reconnectTimerRef.current;
        if (
          connectionEpochRef.current !== epoch ||
          reconnect?.epoch !== epoch ||
          reconnect.timer !== timer
        ) {
          return;
        }
        reconnectTimerRef.current = null;
        backoffRef.current = Math.min(backoffRef.current * 2, 30000);
        connectRef.current(false);
      }, backoffRef.current);
      reconnectTimerRef.current = { epoch, timer };
    };

    socket.onerror = () => {
      if (!isAuthoritative()) return;
      // onclose will handle reconnection
    };
  }, []);

  // Paired-device browsers (bearer in localStorage) can't set an Authorization
  // header on a WebSocket and the durable bearer must never ride the socket.
  // Mint a fresh single-use ticket per (re)connect and present only that.
  // Unpaired browsers (cookie/loopback auth) skip ticketing — unchanged path.
  const connect = useCallback(
    (foreground: boolean) => {
      if (foreground && foregroundReconnectPendingRef.current) return;
      if (foreground) foregroundReconnectPendingRef.current = true;

      const epoch = invalidateConnection();
      setStatus("connecting");
      if (getDeviceBearer()) {
        mintWsTicket("browser")
          .then((ticket) => {
            if (connectionEpochRef.current !== epoch) return;
            openSocket(ticket ? appendWsTicket(url, ticket) : url, epoch);
          })
          .catch(() => {
            if (connectionEpochRef.current !== epoch) return;
            openSocket(url, epoch);
          });
      } else {
        openSocket(url, epoch);
      }
    },
    [url, invalidateConnection, openSocket],
  );
  connectRef.current = connect;

  useEffect(() => {
    connect(false);
    return () => {
      // Invalidate first so even browser-dispatched callbacks already captured
      // from this effect cannot mutate the successor connection.
      connectionEpochRef.current++;
      foregroundReconnectPendingRef.current = false;
      clearReconnectTimer();
      closeCurrentSocket();
    };
  }, [connect, clearReconnectTimer, closeCurrentSocket]);
  // (plugin-action-bridge registration is set up below in another useEffect
  // after `send` is defined.)

  const send = useCallback((msg: BrowserToServerMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Register `send` as the global plugin-action sender so the
  // IntentRenderer's action wiring can route through this connection.
  // See change: adopt-server-driven-intent-rendering.
  useEffect(() => {
    setPluginActionSender(send);
    return () => setPluginActionSender(null);
  }, [send]);

  const onMessage = useCallback((handler: (msg: ServerToBrowserMessage) => void) => {
    handlersRef.current.push(handler);
    return () => {
      handlersRef.current = handlersRef.current.filter((h) => h !== handler);
    };
  }, []);

  /** Force a fresh transport generation. Foreground coalesces duplicate
   * visibility/pageshow signals until its replacement socket opens. */
  const reconnectNow = useCallback((reason: "foreground" | "retry" | "manual" = "manual") => {
    connectRef.current(reason === "foreground");
  }, []);

  return { send, onMessage, status, serverEpoch, connectionEpoch, reconnectNow };
}
