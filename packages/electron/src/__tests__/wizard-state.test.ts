import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isFirstRun, readModeFile, writeModeFile, isApiKeyConfigured, writeApiKey } from "../lib/wizard-state.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("wizard-state", () => {
  let testDir: string;
  let origHome: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `test-wizard-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(path.join(testDir, ".pi-dashboard"), { recursive: true });
    fs.mkdirSync(path.join(testDir, ".pi", "agent"), { recursive: true });
    origHome = process.env.HOME!;
    process.env.HOME = testDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("isFirstRun returns true when mode.json does not exist", () => {
    expect(isFirstRun()).toBe(true);
  });

  it("isFirstRun returns false after writeModeFile", () => {
    writeModeFile("standalone");
    expect(isFirstRun()).toBe(false);
  });

  it("writeModeFile persists mode and timestamp", () => {
    writeModeFile("power-user");
    const config = readModeFile();
    expect(config?.mode).toBe("power-user");
    expect(config?.completedAt).toBeDefined();
  });

  it("readModeFile returns null for missing file", () => {
    expect(readModeFile()).toBeNull();
  });

  it("isApiKeyConfigured returns false when no settings", () => {
    expect(isApiKeyConfigured()).toBe(false);
  });

  it("isApiKeyConfigured returns true after writeApiKey", () => {
    writeApiKey("anthropic", "sk-test-123");
    expect(isApiKeyConfigured()).toBe(true);
  });

  // See change: fix-doctor-oauth-credential-detection.
  it("isApiKeyConfigured returns true for OAuth-only auth.json", () => {
    const authFile = path.join(testDir, ".pi", "agent", "auth.json");
    fs.writeFileSync(
      authFile,
      JSON.stringify({
        anthropic: { type: "oauth", access: "tok", refresh: "r", expires: 9e15 },
      }),
    );
    expect(isApiKeyConfigured()).toBe(true);
  });

  it("writeApiKey creates settings file if missing", () => {
    const settingsFile = path.join(testDir, ".pi", "agent", "settings.json");
    expect(fs.existsSync(settingsFile)).toBe(false);
    writeApiKey("openai", "sk-openai-123");
    expect(fs.existsSync(settingsFile)).toBe(true);
    const data = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
    expect(data.openaiApiKey).toBe("sk-openai-123");
  });
});
