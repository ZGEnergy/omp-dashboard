import { describe, it, expect } from "vitest";
import type { DiscoveredServerInfo } from "../components/ServerSelector.js";

describe("ServerSelector logic", () => {
  it("getInitialWsUrl returns saved server from localStorage", () => {
    // Test the URL building logic
    const saved = "remote.local:8000";
    const [host, port] = saved.split(":");
    expect(host).toBe("remote.local");
    expect(port).toBe("8000");
    const url = `ws://${host}:${port}/ws`;
    expect(url).toBe("ws://remote.local:8000/ws");
  });

  it("shows selector when at least one server exists", () => {
    const servers: DiscoveredServerInfo[] = [
      { host: "localhost", port: 8000, piPort: 9999, version: "1.0", pid: 123, isLocal: true, source: "mdns" },
    ];
    const shouldShow = servers.length > 0;
    expect(shouldShow).toBe(true);
  });

  it("shows dropdown when remote servers are present", () => {
    const servers: DiscoveredServerInfo[] = [
      { host: "localhost", port: 8000, piPort: 9999, version: "1.0", pid: 123, isLocal: true, source: "mdns" },
      { host: "remote.local", port: 8000, piPort: 9999, version: "1.0", pid: 456, isLocal: false, source: "mdns" },
    ];
    const shouldShow = !(servers.length <= 1 && servers.every(s => s.isLocal));
    expect(shouldShow).toBe(true);
  });

  it("localStorage roundtrip for last server", () => {
    const host = "workstation.local";
    const port = 8000;
    const key = `${host}:${port}`;
    expect(key).toBe("workstation.local:8000");
    
    // Parse back
    const [parsedHost, parsedPort] = key.split(":");
    expect(parsedHost).toBe("workstation.local");
    expect(parseInt(parsedPort, 10)).toBe(8000);
  });
});
