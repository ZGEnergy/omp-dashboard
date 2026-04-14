/**
 * Tests for the shared bridge-register module.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// We test against a real temp filesystem
import { findBundledExtension, registerBridgeExtension } from "../bridge-register.js";

describe("shared bridge-register", () => {
  let tmpDir: string;
  let settingsPath: string;
  let origHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shared-bridge-test-"));
    settingsPath = path.join(tmpDir, ".pi", "agent", "settings.json");
    origHome = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSettings(data: Record<string, unknown>) {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
  }

  function readSettings(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  }

  describe("findBundledExtension", () => {
    it("finds extension in packages/extension/ under base dir", () => {
      const baseDir = path.join(tmpDir, "server");
      const extDir = path.join(baseDir, "packages", "extension");
      fs.mkdirSync(extDir, { recursive: true });
      fs.writeFileSync(path.join(extDir, "package.json"), '{"name":"test"}');

      expect(findBundledExtension(baseDir)).toBe(extDir);
    });

    it("returns null when extension dir does not exist", () => {
      expect(findBundledExtension(tmpDir)).toBeNull();
    });

    it("returns null when no package.json in extension dir", () => {
      const extDir = path.join(tmpDir, "packages", "extension");
      fs.mkdirSync(extDir, { recursive: true });
      // No package.json
      expect(findBundledExtension(tmpDir)).toBeNull();
    });

    it("returns null for AppImage temp mount paths", () => {
      // We can't easily create a /tmp/.mount_ path, but we can verify
      // the function handles it via the string check
      const mockBase = "/tmp/.mount_PI1234/resources/server";
      // findBundledExtension will check existsSync which returns false for this
      expect(findBundledExtension(mockBase)).toBeNull();
    });
  });

  describe("registerBridgeExtension", () => {
    it("registers extension path in empty settings", () => {
      const extPath = "/app/packages/extension";
      registerBridgeExtension(extPath);

      const settings = readSettings();
      expect(settings.packages).toContain(extPath);
    });

    it("is idempotent — does not add duplicates", () => {
      const extPath = "/app/packages/extension";
      registerBridgeExtension(extPath);
      registerBridgeExtension(extPath);

      const settings = readSettings();
      const count = (settings.packages as string[]).filter(p => p === extPath).length;
      expect(count).toBe(1);
    });

    it("preserves existing valid dashboard paths", () => {
      // Create a valid extension dir
      const existingExt = path.join(tmpDir, "dev", "pi-agent-dashboard", "ext");
      fs.mkdirSync(existingExt, { recursive: true });
      fs.writeFileSync(path.join(existingExt, "package.json"), "{}");

      writeSettings({ packages: [existingExt] });

      const newPath = "/app/new/extension";
      registerBridgeExtension(newPath);

      const settings = readSettings();
      const packages = settings.packages as string[];
      expect(packages).toContain(existingExt); // preserved
      expect(packages).toContain(newPath); // added
    });

    it("removes stale (non-existent) dashboard paths", () => {
      const stalePath = "/old/nonexistent/pi-dashboard/ext";
      writeSettings({ packages: [stalePath] });

      const newPath = "/app/new/extension";
      registerBridgeExtension(newPath);

      const settings = readSettings();
      const packages = settings.packages as string[];
      expect(packages).not.toContain(stalePath);
      expect(packages).toContain(newPath);
    });

    it("preserves non-dashboard paths", () => {
      writeSettings({ packages: ["/some/other/extension"] });

      registerBridgeExtension("/app/extension");

      const settings = readSettings();
      const packages = settings.packages as string[];
      expect(packages).toContain("/some/other/extension");
      expect(packages).toContain("/app/extension");
    });

    it("handles missing settings.json gracefully", () => {
      // No settings dir exists
      registerBridgeExtension("/app/extension");

      const settings = readSettings();
      expect(settings.packages).toContain("/app/extension");
    });
  });
});
