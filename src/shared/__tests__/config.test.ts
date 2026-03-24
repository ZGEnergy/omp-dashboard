import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, ensureConfig, type DashboardConfig } from "../config.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("loadConfig", () => {
  let testDir: string;
  let configFile: string;
  let origHome: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `test-config-${Date.now()}`);
    fs.mkdirSync(path.join(testDir, ".pi", "dashboard"), { recursive: true });
    configFile = path.join(testDir, ".pi", "dashboard", "config.json");
    origHome = process.env.HOME!;
    process.env.HOME = testDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
  });

  it("should return all defaults when config file is missing", () => {
    const config = loadConfig();
    expect(config.port).toBe(8000);
    expect(config.piPort).toBe(9999);
    expect(config.autoStart).toBe(true);
    expect(config.autoShutdown).toBe(true);
    expect(config.shutdownIdleSeconds).toBe(300);
  });

  it("should return values from config when all fields present", () => {
    fs.writeFileSync(configFile, JSON.stringify({
      port: 3000,
      piPort: 4000,
      autoStart: false,
    }));

    const config = loadConfig();
    expect(config.port).toBe(3000);
    expect(config.piPort).toBe(4000);
    expect(config.autoStart).toBe(false);
  });

  it("should apply defaults for omitted fields", () => {
    fs.writeFileSync(configFile, JSON.stringify({ port: 3000 }));

    const config = loadConfig();
    expect(config.port).toBe(3000);
    expect(config.piPort).toBe(9999);
    expect(config.autoStart).toBe(true);
    expect(config.autoShutdown).toBe(true);
    expect(config.shutdownIdleSeconds).toBe(300);
  });

  it("should load auto-shutdown config fields", () => {
    fs.writeFileSync(configFile, JSON.stringify({
      autoShutdown: false,
      shutdownIdleSeconds: 60,
    }));

    const config = loadConfig();
    expect(config.autoShutdown).toBe(false);
    expect(config.shutdownIdleSeconds).toBe(60);
    expect(config.port).toBe(8000);
  });

  it("should return defaults for malformed JSON", () => {
    fs.writeFileSync(configFile, "not valid json {{{");

    const config = loadConfig();
    expect(config.port).toBe(8000);
    expect(config.piPort).toBe(9999);
    expect(config.autoStart).toBe(true);
  });

  it("should return defaults for empty file", () => {
    fs.writeFileSync(configFile, "");

    const config = loadConfig();
    expect(config.port).toBe(8000);
  });
});

describe("ensureConfig", () => {
  let testDir: string;
  let configDir: string;
  let configFile: string;
  let origHome: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `test-ensure-${Date.now()}`);
    configDir = path.join(testDir, ".pi", "dashboard");
    configFile = path.join(configDir, "config.json");
    origHome = process.env.HOME!;
    process.env.HOME = testDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
  });

  it("should create directory and config when nothing exists", () => {
    ensureConfig();
    expect(fs.existsSync(configFile)).toBe(true);

    const content = JSON.parse(fs.readFileSync(configFile, "utf-8"));
    expect(content.port).toBe(8000);
    expect(content.piPort).toBe(9999);
    expect(content.autoStart).toBe(true);
    expect(content.autoShutdown).toBe(true);
    expect(content.shutdownIdleSeconds).toBe(300);
  });

  it("should create config when directory exists but file does not", () => {
    fs.mkdirSync(configDir, { recursive: true });
    ensureConfig();
    expect(fs.existsSync(configFile)).toBe(true);
  });

  it("should not overwrite existing config", () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify({ port: 1234 }));

    ensureConfig();

    const content = JSON.parse(fs.readFileSync(configFile, "utf-8"));
    expect(content.port).toBe(1234);
    expect(content.piPort).toBeUndefined();
  });
});
