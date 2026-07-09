import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "@blackbelt-technology/pi-dashboard-shared/config.js";
import { writeConfigPartial } from "../config-api.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { DiscoveredServer } from "@blackbelt-technology/pi-dashboard-shared/mdns-discovery.js";

describe("known-servers CRUD", () => {
  let testDir: string;
  let configFile: string;
  let origHome: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `test-known-servers-${Date.now()}`);
    fs.mkdirSync(path.join(testDir, ".omp", "dashboard"), { recursive: true });
    configFile = path.join(testDir, ".omp", "dashboard", "config.json");
    fs.writeFileSync(configFile, JSON.stringify({}));
    origHome = process.env.HOME!;
    process.env.HOME = testDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
  });

  it("should default to empty knownServers", () => {
    const config = loadConfig();
    expect(config.knownServers).toEqual([]);
  });

  it("should add a known server", () => {
    const server = { host: "office-mac", port: 8000, label: "Office", addedAt: new Date().toISOString() };
    writeConfigPartial({ knownServers: [server] });
    const config = loadConfig();
    expect(config.knownServers).toHaveLength(1);
    expect(config.knownServers[0].host).toBe("office-mac");
    expect(config.knownServers[0].port).toBe(8000);
    expect(config.knownServers[0].label).toBe("Office");
  });

  it("should update label on duplicate host:port", () => {
    const servers = [
      { host: "office-mac", port: 8000, label: "Old Label", addedAt: new Date().toISOString() },
    ];
    writeConfigPartial({ knownServers: servers });

    // Simulate "add duplicate" by reading, updating, writing
    const config = loadConfig();
    const existing = config.knownServers;
    const idx = existing.findIndex((s) => s.host === "office-mac" && s.port === 8000);
    expect(idx).toBe(0);
    existing[idx] = { ...existing[idx], label: "New Label" };
    writeConfigPartial({ knownServers: existing });

    const updated = loadConfig();
    expect(updated.knownServers).toHaveLength(1);
    expect(updated.knownServers[0].label).toBe("New Label");
  });

  it("should remove a known server", () => {
    const servers = [
      { host: "office-mac", port: 8000, label: "Office", addedAt: new Date().toISOString() },
      { host: "build-server", port: 8000, label: "Build", addedAt: new Date().toISOString() },
    ];
    writeConfigPartial({ knownServers: servers });

    const config = loadConfig();
    const filtered = config.knownServers.filter((s) => !(s.host === "office-mac" && s.port === 8000));
    writeConfigPartial({ knownServers: filtered });

    const updated = loadConfig();
    expect(updated.knownServers).toHaveLength(1);
    expect(updated.knownServers[0].host).toBe("build-server");
  });

  it("should be idempotent when removing non-existent server", () => {
    const servers = [
      { host: "office-mac", port: 8000, label: "Office", addedAt: new Date().toISOString() },
    ];
    writeConfigPartial({ knownServers: servers });

    const config = loadConfig();
    const filtered = config.knownServers.filter((s) => !(s.host === "nonexistent" && s.port === 9999));
    writeConfigPartial({ knownServers: filtered });

    const updated = loadConfig();
    expect(updated.knownServers).toHaveLength(1);
  });

  it("should list known servers from config", () => {
    const servers = [
      { host: "a", port: 8000, addedAt: "2024-01-01T00:00:00Z" },
      { host: "b", port: 9000, label: "B Server", addedAt: "2024-01-02T00:00:00Z" },
    ];
    writeConfigPartial({ knownServers: servers });

    const config = loadConfig();
    expect(config.knownServers).toHaveLength(2);
    expect(config.knownServers[0].host).toBe("a");
    expect(config.knownServers[1].label).toBe("B Server");
  });

  it("should handle entries without label", () => {
    const servers = [{ host: "no-label", port: 8000, addedAt: "2024-01-01T00:00:00Z" }];
    writeConfigPartial({ knownServers: servers });

    const config = loadConfig();
    expect(config.knownServers[0].label).toBeUndefined();
  });

  it("should ignore invalid entries in knownServers", () => {
    // Write raw JSON with invalid entries
    fs.writeFileSync(configFile, JSON.stringify({
      knownServers: [
        { host: "valid", port: 8000, addedAt: "2024-01-01T00:00:00Z" },
        { host: "no-port" }, // missing port
        "invalid-string",
        null,
        { port: 8000 }, // missing host
      ],
    }));

    const config = loadConfig();
    expect(config.knownServers).toHaveLength(1);
    expect(config.knownServers[0].host).toBe("valid");
  });
});
