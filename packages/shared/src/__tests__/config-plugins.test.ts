/**
 * Tests for plugins config namespace in DashboardConfig.
 * Verifies round-trip preservation of all keys.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, getPluginsConfig, getPluginConfig } from "../config.ts";

let tmpDir: string;
let origHome: string | undefined;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-plugins-test-"));
  origHome = process.env.HOME;
  process.env.HOME = tmpDir;
});

afterEach(() => {
  process.env.HOME = origHome;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeConfig(data: Record<string, unknown>) {
  const dir = path.join(tmpDir, ".pi", "dashboard");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(data));
}

describe("plugins config round-trip", () => {
  it("preserves all top-level keys including plugins namespace", () => {
    writeConfig({
      port: 9000,
      auth: undefined,
      openspec: { pollIntervalSeconds: 30 },
      plugins: { demo: { foo: 1 } },
    });

    const config = loadConfig();
    expect(config.port).toBe(9000);
    // loadConfig normalizes openspec to full object with defaults
    expect(config.openspec.pollIntervalSeconds).toBe(30);
    expect(getPluginConfig(config, "demo")).toEqual({ foo: 1 });
  });

  it("returns empty object for unknown plugin id", () => {
    writeConfig({ plugins: { demo: { foo: 1 } } });
    const config = loadConfig();
    expect(getPluginConfig(config, "nonexistent")).toEqual({});
  });

  it("returns empty plugins config when plugins key is absent", () => {
    writeConfig({ port: 8000 });
    const config = loadConfig();
    expect(getPluginsConfig(config)).toEqual({});
  });

  it("getPluginsConfig returns all plugin namespaces", () => {
    writeConfig({
      plugins: { demo: { foo: 1 }, openspec: { pollIntervalSeconds: 60 } },
    });
    const config = loadConfig();
    const plugins = getPluginsConfig(config);
    expect(plugins.demo).toEqual({ foo: 1 });
    expect(plugins.openspec).toEqual({ pollIntervalSeconds: 60 });
  });
});
