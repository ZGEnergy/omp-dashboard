import { useEffect, useRef, useCallback, useState } from "react";
import type { ServerToBrowserMessage, BrowserToServerMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import { getApiBase } from "../lib/api-context.js";

export type ConnectionStatus = "connected" | "connecting" | "offline" | "auth_required";

const OFFLINE_THRESHOLD = 3;

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const handlersRef = useRef<((msg: ServerToBrowserMessage) => void)[]>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const failCountRef = useRef(0);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        backoffRef.current = 1000;
        failCountRef.current = 0;
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as ServerToBrowserMessage;
          for (const handler of handlersRef.current) {
            handler(msg);
          }
        } catch {
          // Ignore malformed
        }
      };

      ws.onclose = () => {
        failCountRef.current++;
        if (failCountRef.current >= OFFLINE_THRESHOLD) {
          // Check if it's an auth issue before marking as offline
          fetch(`${getApiBase()}/auth/status`)
            .then((res) => res.json())
            .then((data) => {
              if (data.authenticated === false) {
                setStatus("auth_required");
              } else {
                setStatus("offline");
              }
            })
            .catch(() => setStatus("offline"));
        } else {
          setStatus("connecting");
        }
        reconnectTimerRef.current = setTimeout(() => {
          backoffRef.current = Math.min(backoffRef.current * 2, 30000);
          connect();
        }, backoffRef.current);
      };

      ws.onerror = () => {
        // onclose will handle reconnection
      };
    } catch {
      failCountRef.current++;
      if (failCountRef.current >= OFFLINE_THRESHOLD) {
        setStatus("offline");
      } else {
        setStatus("connecting");
      }
    }
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((msg: BrowserToServerMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const onMessage = useCallback((handler: (msg: ServerToBrowserMessage) => void) => {
    handlersRef.current.push(handler);
    return () => {
      handlersRef.current = handlersRef.current.filter((h) => h !== handler);
    };
  }, []);

  return { send, onMessage, status };
}
