import { describe, it, expect } from "vitest";
import { resolveServerCliPath, buildSpawnArgs } from "../server-launcher.js";
import { existsSync } from "node:fs";
import path from "node:path";

describe("server-launcher", () => {
  describe("resolveServerCliPath", () => {
    it("should return an absolute path", () => {
      expect(path.isAbsolute(resolveServerCliPath())).toBe(true);
    });

    it("should point to packages/server/src/cli.ts", () => {
      const cliPath = resolveServerCliPath();
      expect(cliPath).toContain(path.join("packages", "server", "src", "cli.ts"));
    });

    it("should point to a file that actually exists on disk", () => {
      expect(existsSync(resolveServerCliPath())).toBe(true);
    });
  });

  describe("buildSpawnArgs", () => {
    it("should include port and pi-port flags", () => {
      const args = buildSpawnArgs({
        port: 3000,
        piPort: 4000,
        autoStart: true,
        autoShutdown: true,
        shutdownIdleSeconds: 300,
        spawnStrategy: "tmux",
        tunnel: { enabled: true },
        devBuildOnReload: false,
        memoryLimits: { maxEventsPerSession: 5000, maxStringFieldSize: 0, maxWsBufferBytes: 4194304 },
        editor: { idleTimeoutMinutes: 10, maxInstances: 3 },
      });

      expect(args).toEqual(["--port", "3000", "--pi-port", "4000"]);
    });
  });
});
