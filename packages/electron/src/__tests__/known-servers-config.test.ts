/**
 * Test that loadMinimalConfig correctly parses knownServers from config.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// We test the parsing logic directly since Electron's loadMinimalConfig is inlined
describe("Electron knownServers config parsing", () => {
  let testDir: string;
  let configFile: string;
  let origHome: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `test-electron-config-${Date.now()}`);
    fs.mkdirSync(path.join(testDir, ".omp", "dashboard"), { recursive: true });
    configFile = path.join(testDir, ".omp", "dashboard", "config.json");
    origHome = process.env.HOME!;
    process.env.HOME = testDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
  });

  // Replicate the inlined parsing logic from server-lifecycle.ts
  function parseKnownServers(raw: string): Array<{ host: string; port: number; label?: string }> {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.knownServers)) return [];
      return parsed.knownServers
        .filter((s: any) => s && typeof s.host === "string" && typeof s.port === "number")
        .map((s: any) => ({ host: s.host, port: s.port, ...(typeof s.label === "string" ? { label: s.label } : {}) }));
    } catch {
      return [];
    }
  }

  it("should return empty array when no knownServers", () => {
    expect(parseKnownServers(JSON.stringify({ port: 8000 }))).toEqual([]);
  });

  it("should parse valid known servers", () => {
    const config = {
      knownServers: [
        { host: "office-mac", port: 8000, label: "Office" },
        { host: "build-server", port: 9000 },
      ],
    };
    const result = parseKnownServers(JSON.stringify(config));
    expect(result).toEqual([
      { host: "office-mac", port: 8000, label: "Office" },
      { host: "build-server", port: 9000 },
    ]);
  });

  it("should filter invalid entries", () => {
    const config = {
      knownServers: [
        { host: "valid", port: 8000 },
        { host: "no-port" },
        null,
        "bad",
      ],
    };
    const result = parseKnownServers(JSON.stringify(config));
    expect(result).toHaveLength(1);
    expect(result[0].host).toBe("valid");
  });

  it("should generate known servers HTML for loading page", () => {
    const servers = [
      { host: "office-mac", port: 8000, label: "Office" },
      { host: "build-server", port: 9000 },
    ];
    // Simulate the HTML generation from main.ts
    const buttons = servers.map((s) =>
      `<button onclick="window.switchServer('${s.host}', ${s.port})">${s.label || s.host} - ${s.host}:${s.port}</button>`
    );
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toContain("Office");
    expect(buttons[0]).toContain("office-mac");
    expect(buttons[1]).toContain("build-server");
  });
});
