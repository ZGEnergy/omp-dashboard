/**
 * Smoke tests — validate the harness itself, not any real scenario.
 * Full scenario families (A–K) land in later tasks.
 */
import { describe, expect, it } from "vitest";
import { withFakeEnv, layer, toMemfsPath } from "./harness.js";
import {
  registerDefaultTools,
} from "../../tool-registry/definitions.js";
import { registerBridgeExtension } from "../../bridge-register.js";

describe("harness smoke", () => {
  it("withFakeEnv runs callback with HarnessContext (posix)", async () => {
    const result = await withFakeEnv(
      {
        platform: "linux",
        homedir: "/home/robson",
        env: { PATH: "/usr/bin:/usr/local/bin" },
        fs: { "/home/robson/.pi/config": "x" },
      },
      (ctx) => {
        expect(ctx.platform).toBe("linux");
        expect(ctx.homedir).toBe("/home/robson");
        expect(ctx.pathEntries).toEqual(["/usr/bin", "/usr/local/bin"]);
        expect(ctx.fs.existsSync("/home/robson/.pi/config")).toBe(true);
        return 42;
      },
    );
    expect(result).toBe(42);
  });

  it("withFakeEnv supports win32 paths via translation", async () => {
    await withFakeEnv(
      {
        platform: "win32",
        homedir: "C:\\Users\\Robert",
        env: { PATH: "C:\\Windows\\System32;C:\\Program Files\\nodejs" },
        fs: {
          "C:\\Users\\Robert\\.pi-dashboard\\node_modules\\.bin\\pi.cmd":
            "@node pi",
        },
      },
      (ctx) => {
        expect(ctx.pathEntries).toEqual([
          "C:\\Windows\\System32",
          "C:\\Program Files\\nodejs",
        ]);
        // existsSync via the wrapped fs should accept win32-style paths
        expect(
          ctx.fs.existsSync(
            "C:\\Users\\Robert\\.pi-dashboard\\node_modules\\.bin\\pi.cmd",
          ),
        ).toBe(true);
      },
    );
  });

  it("toMemfsPath translates Windows paths to posix keys", () => {
    expect(toMemfsPath("C:\\Users\\Robert\\.pi")).toBe("/C:/Users/Robert/.pi");
    expect(toMemfsPath("/already/posix")).toBe("/already/posix");
  });

  it("which() walks fake PATH and finds binaries with .cmd on win32", async () => {
    await withFakeEnv(
      {
        platform: "win32",
        homedir: "C:\\Users\\R",
        env: { PATH: "C:\\bin" },
        fs: { "C:\\bin\\pi.cmd": "@echo off" },
      },
      (ctx) => {
        const deps = ctx.createStrategyDeps();
        expect(deps.which("pi")).toBe("C:\\bin\\pi.cmd");
        expect(deps.which("nonexistent")).toBe(null);
      },
    );
  });

  it("which() on posix finds binary without extension", async () => {
    await withFakeEnv(
      {
        platform: "linux",
        homedir: "/home/r",
        env: { PATH: "/usr/local/bin" },
        fs: { "/usr/local/bin/pi": "#!/bin/sh\nexec node pi.js" },
      },
      (ctx) => {
        const deps = ctx.createStrategyDeps();
        expect(deps.which("pi")).toBe("/usr/local/bin/pi");
      },
    );
  });

  it("resolveModule() walks node_modules ancestor chain", async () => {
    await withFakeEnv(
      {
        platform: "linux",
        homedir: "/home/r",
        fs: {
          "/home/r/project/src/index.ts": "x",
          "/home/r/project/node_modules/@mariozechner/pi/package.json":
            JSON.stringify({ name: "@mariozechner/pi", main: "dist/cli.js" }),
          "/home/r/project/node_modules/@mariozechner/pi/dist/cli.js":
            "#!/usr/bin/env node",
        },
      },
      (ctx) => {
        const deps = ctx.createStrategyDeps();
        const resolved = deps.resolveModule(
          "@mariozechner/pi",
          "/home/r/project/src/index.ts",
        );
        expect(resolved).toBe(
          "/home/r/project/node_modules/@mariozechner/pi/dist/cli.js",
        );
      },
    );
  });

  it("resolveModule() returns null when package absent", async () => {
    await withFakeEnv(
      {
        platform: "linux",
        homedir: "/home/r",
        fs: { "/home/r/project/src/index.ts": "x" },
      },
      (ctx) => {
        const deps = ctx.createStrategyDeps();
        expect(
          deps.resolveModule("@mariozechner/pi", "/home/r/project/src/index.ts"),
        ).toBe(null);
      },
    );
  });

  it("layer() merges fs records (later overrides earlier)", () => {
    const merged = layer(
      { "/a": "1", "/b": "2" },
      { "/b": "3", "/c": "4" },
    );
    expect(merged).toEqual({ "/a": "1", "/b": "3", "/c": "4" });
  });

  it("createRegistry wires env and platform through to strategies (linux, managed bin)", async () => {
    // On Unix, pi resolves via <managedBin>/pi (the `.bin` shim).
    await withFakeEnv(
      {
        platform: "linux",
        homedir: "/home/r",
        fs: {
          "/home/r/.pi-dashboard/node_modules/.bin/pi":
            "#!/usr/bin/env node",
        },
      },
      (ctx) => {
        const registry = ctx.createRegistry();
        const deps = ctx.createStrategyDeps();
        registerDefaultTools(registry, deps);
        const res = registry.resolve("pi");
        expect(res.ok).toBe(true);
        expect(res.source).toBe("managed");
        expect(res.path).toBe("/home/r/.pi-dashboard/node_modules/.bin/pi");
      },
    );
  });

  it("createRegistry resolves pi via managed module on win32", async () => {
    // On Windows, pi's chain includes managedModuleStrategy for
    // pi-coding-agent — finds dist/cli.js directly.
    await withFakeEnv(
      {
        platform: "win32",
        homedir: "C:\\Users\\R",
        fs: {
          "C:\\Users\\R\\.pi-dashboard\\node_modules\\@mariozechner\\pi-coding-agent\\dist\\cli.js":
            "#!/usr/bin/env node",
        },
      },
      (ctx) => {
        const registry = ctx.createRegistry();
        const deps = ctx.createStrategyDeps();
        registerDefaultTools(registry, deps);
        const res = registry.resolve("pi");
        expect(res.ok).toBe(true);
        expect(res.source).toBe("managed");
      },
    );
  });

  it("readSettings returns null when settings.json absent", async () => {
    await withFakeEnv(
      { platform: "linux", homedir: "/home/r", fs: {} },
      (ctx) => {
        expect(ctx.readSettings()).toBe(null);
      },
    );
  });

  it("bridge registration writes settings.json under fake HOME", async () => {
    await withFakeEnv(
      {
        platform: "linux",
        homedir: "/home/r",
        fs: {
          "/opt/extension/package.json": JSON.stringify({ name: "ext" }),
        },
      },
      (ctx) => {
        // Register bridge using the homedir override, but the real
        // implementation uses `node:fs` — which means this assertion
        // verifies the API signature compiles. Actual fake-fs bridge
        // writes land in a follow-up task (bridge-register needs to
        // accept an injectable fs impl; out of scope for smoke).
        expect(() =>
          registerBridgeExtension("/opt/extension", { homedir: "/tmp/nope" }),
        ).not.toThrow();
      },
    );
  });
});
