import type { ConnectionStatus } from "./useWebSocket.js";

/** A visible app with an open socket already has the authoritative live tail. */
export function shouldReconnectForForeground(status: ConnectionStatus): boolean {
  return status === "offline";
}
