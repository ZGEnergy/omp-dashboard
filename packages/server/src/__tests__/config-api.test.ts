import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readConfigRedacted, writeConfigPartial } from "../config-api.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("config-api", () => {
  let testDir: string;
  let configFile: string;
  let origHome: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `test-config-api-${Date.now()}`);
    fs.mkdirSync(path.join(testDir, ".pi", "dashboard"), { recursive: true });
    configFile = path.join(testDir, ".pi", "dashboard", "config.json");
    origHome = process.env.HOME!;
    process.env.HOME = testDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
  });

  describe("readConfigRedacted", () => {
    it("should redact auth.secret and provider clientSecrets", () => {
      fs.writeFileSync(configFile, JSON.stringify({
        port: 8000,
        auth: {
          secret: "real-secret",
          providers: {
            github: { clientId: "id1", clientSecret: "real-client-secret" },
          },
        },
      }));
      const config = readConfigRedacted();
      expect(config.auth!.secret).toBe("***");
      expect(config.auth!.providers.github.clientSecret).toBe("***");
      expect(config.auth!.providers.github.clientId).toBe("id1");
    });

    it("should return config without auth when not configured", () => {
      fs.writeFileSync(configFile, JSON.stringify({ port: 3000 }));
      const config = readConfigRedacted();
      expect(config.auth).toBeUndefined();
      expect(config.port).toBe(3000);
    });
  });

  describe("writeConfigPartial", () => {
    it("should merge partial config and write to disk", () => {
      fs.writeFileSync(configFile, JSON.stringify({ port: 8000, autoShutdown: true }));
      const result = writeConfigPartial({ autoShutdown: false });
      expect(result.success).toBe(true);
      expect(result.restartRequired).toBe(false);
      const written = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(written.autoShutdown).toBe(false);
      expect(written.port).toBe(8000); // preserved
    });

    it("should flag restartRequired when port changes", () => {
      fs.writeFileSync(configFile, JSON.stringify({ port: 8000 }));
      const result = writeConfigPartial({ port: 9000 });
      expect(result.success).toBe(true);
      expect(result.restartRequired).toBe(true);
    });

    it("should flag restartRequired when piPort changes", () => {
      fs.writeFileSync(configFile, JSON.stringify({ piPort: 9999 }));
      const result = writeConfigPartial({ piPort: 8888 });
      expect(result.restartRequired).toBe(true);
    });

    it("should not flag restartRequired for non-port changes", () => {
      fs.writeFileSync(configFile, JSON.stringify({ port: 8000, autoShutdown: true }));
      const result = writeConfigPartial({ autoShutdown: false, shutdownIdleSeconds: 60 });
      expect(result.restartRequired).toBe(false);
    });

    it("should preserve redacted auth.secret", () => {
      fs.writeFileSync(configFile, JSON.stringify({
        auth: { secret: "real-secret", providers: { github: { clientId: "id", clientSecret: "real-cs" } } },
      }));
      const result = writeConfigPartial({
        auth: { secret: "***", providers: { github: { clientId: "new-id", clientSecret: "***" } } },
      });
      expect(result.success).toBe(true);
      const written = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(written.auth.secret).toBe("real-secret");
      expect(written.auth.providers.github.clientSecret).toBe("real-cs");
      expect(written.auth.providers.github.clientId).toBe("new-id");
    });

    it("should update allowedUsers", () => {
      fs.writeFileSync(configFile, JSON.stringify({ auth: { providers: { github: { clientId: "x", clientSecret: "y" } } } }));
      const result = writeConfigPartial({ auth: { allowedUsers: ["octocat", "*@company.com"] } });
      expect(result.success).toBe(true);
      const written = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(written.auth.allowedUsers).toEqual(["octocat", "*@company.com"]);
      // providers preserved
      expect(written.auth.providers.github.clientId).toBe("x");
    });
  });
});
