import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "@blackbelt-technology/pi-dashboard-shared/config.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("trustedNetworks config", () => {
  let testDir: string;
  let configFile: string;
  let origHome: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `test-trusted-nets-${Date.now()}`);
    fs.mkdirSync(path.join(testDir, ".pi", "dashboard"), { recursive: true });
    configFile = path.join(testDir, ".pi", "dashboard", "config.json");
    origHome = process.env.HOME!;
    process.env.HOME = testDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("should default to empty arrays when not configured", () => {
    fs.writeFileSync(configFile, JSON.stringify({ port: 8000 }));
    const config = loadConfig();
    expect(config.trustedNetworks).toEqual([]);
    expect(config.resolvedTrustedNetworks).toEqual([]);
  });

  it("should parse trustedNetworks", () => {
    fs.writeFileSync(configFile, JSON.stringify({
      trustedNetworks: ["192.168.1.0/24", "10.0.0.*"],
    }));
    const config = loadConfig();
    expect(config.trustedNetworks).toEqual(["192.168.1.0/24", "10.0.0.*"]);
    expect(config.resolvedTrustedNetworks).toEqual(["192.168.1.0/24", "10.0.0.*"]);
  });

  it("should merge trustedNetworks with auth.bypassHosts", () => {
    fs.writeFileSync(configFile, JSON.stringify({
      trustedNetworks: ["192.168.1.0/24"],
      auth: {
        secret: "s",
        providers: { github: { clientId: "a", clientSecret: "b" } },
        bypassHosts: ["10.0.0.0/8"],
      },
    }));
    const config = loadConfig();
    expect(config.resolvedTrustedNetworks).toContain("192.168.1.0/24");
    expect(config.resolvedTrustedNetworks).toContain("10.0.0.0/8");
  });

  it("should deduplicate entries", () => {
    fs.writeFileSync(configFile, JSON.stringify({
      trustedNetworks: ["192.168.1.0/24"],
      auth: {
        secret: "s",
        providers: { github: { clientId: "a", clientSecret: "b" } },
        bypassHosts: ["192.168.1.0/24"],
      },
    }));
    const config = loadConfig();
    expect(config.resolvedTrustedNetworks).toEqual(["192.168.1.0/24"]);
  });

  it("should filter non-string entries", () => {
    fs.writeFileSync(configFile, JSON.stringify({
      trustedNetworks: ["192.168.1.0/24", 123, null, ""],
    }));
    const config = loadConfig();
    expect(config.trustedNetworks).toEqual(["192.168.1.0/24"]);
  });

  it("should handle trustedNetworks without auth", () => {
    fs.writeFileSync(configFile, JSON.stringify({
      trustedNetworks: ["10.0.0.0/8"],
    }));
    const config = loadConfig();
    expect(config.resolvedTrustedNetworks).toEqual(["10.0.0.0/8"]);
    expect(config.auth).toBeUndefined();
  });
});
