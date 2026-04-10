import { describe, it, expect } from "vitest";
import { isPortOpen } from "../server-probe.js";
import net from "node:net";

describe("isPortOpen", () => {
  it("should return true when a server is listening", async () => {
    // Start a temporary server
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as net.AddressInfo).port;

    try {
      const result = await isPortOpen(port);
      expect(result).toBe(true);
    } finally {
      server.close();
    }
  });

  it("should return false when no server is listening", async () => {
    // Use a port that's almost certainly not in use
    const result = await isPortOpen(59321);
    expect(result).toBe(false);
  });
});
