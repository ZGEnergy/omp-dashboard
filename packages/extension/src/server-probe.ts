/**
 * TCP port probe to detect if the dashboard server is running.
 */
import net from "node:net";

const PROBE_TIMEOUT = 1000;

/**
 * Check if a port is open on localhost by attempting a TCP connection.
 * Returns true if connection succeeds, false if refused or timed out.
 */
export function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "localhost", port });

    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, PROBE_TIMEOUT);

    socket.on("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
  });
}
