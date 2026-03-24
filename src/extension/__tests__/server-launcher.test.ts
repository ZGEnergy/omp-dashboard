import { describe, it, expect, vi } from "vitest";
import { resolveServerCliPath } from "../server-launcher.js";
import path from "node:path";

describe("server-launcher", () => {
  it("should resolve server CLI path relative to extension", () => {
    const cliPath = resolveServerCliPath();
    // From src/extension/server-launcher.ts → ../../server/cli.ts
    expect(cliPath).toContain("server");
    expect(cliPath).toContain("cli.ts");
    expect(path.isAbsolute(cliPath)).toBe(true);
  });

  it("should build correct spawn args from config", async () => {
    // We test the arg building logic, not the actual spawn
    const { buildSpawnArgs } = await import("../server-launcher.js");
    const args = buildSpawnArgs({
      port: 3000,
      piPort: 4000,
      autoStart: true,
      autoShutdown: true,
      shutdownIdleSeconds: 300,
      tunnel: { enabled: true },
    });

    expect(args).toContain("--port");
    expect(args).toContain("3000");
    expect(args).toContain("--pi-port");
    expect(args).toContain("4000");
  });
});
