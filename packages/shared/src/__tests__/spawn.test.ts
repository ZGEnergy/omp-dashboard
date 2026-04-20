/**
 * Tests for platform/detached-spawn.ts primitives.
 *
 * Uses real `node -e` subprocess fixtures (no mocking) so we can exercise
 * the actual Node spawn path with libuv's detached semantics on whatever
 * OS the test runs on.
 *
 * All platform-dependent helpers take an explicit `platform` argument so
 * tests can exercise both branches. We never mutate `process.platform`
 * and never `vi.mock`.
 */
import { describe, it, expect } from "vitest";
import { openSync, closeSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnDetached, waitForNoCrash, waitForReady } from "../platform/spawn.js";

function tmpLog(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dspawn-"));
  return path.join(dir, "out.log");
}

describe("spawnDetached", () => {
  it("spawns a real detached child with correct defaults", async () => {
    const r = await spawnDetached({
      cmd: process.execPath,
      args: ["-e", "setTimeout(() => process.exit(0), 300)"],
    });
    expect(r.ok).toBe(true);
    expect(r.pid).toBeTypeOf("number");
    expect(r.process).toBeDefined();
    // clean up
    await new Promise((res) => r.process!.once("exit", res));
  });

  it("returns ok:false with error when cmd does not exist", async () => {
    const r = await spawnDetached({
      cmd: "/definitely/not/a/real/binary/nope.exe",
      args: [],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("redirects stderr to logFd when provided", async () => {
    const logPath = tmpLog();
    const fd = openSync(logPath, "a");
    try {
      const r = await spawnDetached({
        cmd: process.execPath,
        args: ["-e", "process.stderr.write('BOOM'); setTimeout(() => process.exit(0), 100)"],
        logFd: fd,
      });
      expect(r.ok).toBe(true);
      await new Promise((res) => r.process!.once("exit", res));
    } finally {
      try { closeSync(fd); } catch { /* ignore */ }
    }
    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("BOOM");
    rmSync(path.dirname(logPath), { recursive: true, force: true });
  });

  it("does not keep parent event loop alive (unref)", async () => {
    // Can only check behaviour indirectly: the returned pid/process exist
    // and the child is running detached. Lifecycle survival is covered by
    // Node's own libuv tests; we assert we didn't throw.
    const r = await spawnDetached({
      cmd: process.execPath,
      args: ["-e", "setTimeout(() => process.exit(0), 100)"],
    });
    expect(r.ok).toBe(true);
    await new Promise((res) => r.process!.once("exit", res));
  });

  // ── detach option ────────────────────────────────────────────────────────
  //
  // Behaviour of `detach` can't be directly observed at the Node level
  // (libuv's UV_PROCESS_DETACHED flag + setpgid/JobObject are internal).
  // These tests verify the OPTION is accepted and does not break spawn;
  // lifecycle semantics are exercised in the integration smoke tests
  // (phase 2.10 manual Windows check).

  it("accepts detach: true (default behaviour, unchanged)", async () => {
    const r = await spawnDetached({
      cmd: process.execPath,
      args: ["-e", "setTimeout(() => process.exit(0), 100)"],
      detach: true,
    });
    expect(r.ok).toBe(true);
    await new Promise((res) => r.process!.once("exit", res));
  });

  it("accepts detach: false without breaking spawn", async () => {
    const r = await spawnDetached({
      cmd: process.execPath,
      args: ["-e", "setTimeout(() => process.exit(0), 100)"],
      detach: false,
    });
    expect(r.ok).toBe(true);
    await new Promise((res) => r.process!.once("exit", res));
  });

  it("accepts detach: undefined (implicit default)", async () => {
    const r = await spawnDetached({
      cmd: process.execPath,
      args: ["-e", "setTimeout(() => process.exit(0), 100)"],
      // detach is deliberately omitted
    });
    expect(r.ok).toBe(true);
    await new Promise((res) => r.process!.once("exit", res));
  });
});

describe("waitForNoCrash", () => {
  it("returns ok:true when child outlives the window", async () => {
    const r = await spawnDetached({
      cmd: process.execPath,
      args: ["-e", "setTimeout(() => process.exit(0), 1000)"],
    });
    expect(r.ok).toBe(true);
    const gate = await waitForNoCrash({ child: r.process!, windowMs: 150 });
    expect(gate.ok).toBe(true);
    await new Promise((res) => r.process!.once("exit", res));
  });

  it("returns ok:false with exitCode when child exits early", async () => {
    const r = await spawnDetached({
      cmd: process.execPath,
      args: ["-e", "process.exit(7)"],
    });
    expect(r.ok).toBe(true);
    const gate = await waitForNoCrash({ child: r.process!, windowMs: 1000 });
    expect(gate.ok).toBe(false);
    expect(gate.exitCode).toBe(7);
  });

  it("respects a small windowMs and does not hang on live children", async () => {
    const r = await spawnDetached({
      cmd: process.execPath,
      args: ["-e", "setTimeout(() => process.exit(0), 5000)"],
    });
    expect(r.ok).toBe(true);
    const start = Date.now();
    const gate = await waitForNoCrash({ child: r.process!, windowMs: 100 });
    const elapsed = Date.now() - start;
    expect(gate.ok).toBe(true);
    expect(elapsed).toBeLessThan(500);
    r.process!.kill();
    await new Promise((res) => r.process!.once("exit", res));
  });
});

describe("waitForReady", () => {
  it("returns ok:true when probe succeeds", async () => {
    const r = await waitForReady({
      probe: async () => true,
      deadlineMs: 1000,
      pollIntervalMs: 50,
    });
    expect(r.ok).toBe(true);
  });

  it("returns ok:false with 'timeout' when probe never succeeds", async () => {
    const r = await waitForReady({
      probe: async () => false,
      deadlineMs: 200,
      pollIntervalMs: 50,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("timeout");
  });

  it("short-circuits on child error event", async () => {
    // Spawn a nonexistent path via spawnDetached — triggers error event.
    const bad = await spawnDetached({
      cmd: "/does/not/exist/XYZQQ",
      args: [],
    });
    // bad.process may or may not exist depending on how Node surfaced the
    // error. If it does, we can observe the short-circuit; if not, skip
    // this specific assertion. Either way, waitForReady must not hang.
    if (bad.process) {
      const start = Date.now();
      const r = await waitForReady({
        probe: async () => false,
        deadlineMs: 5000,
        pollIntervalMs: 500,
        child: bad.process,
      });
      const elapsed = Date.now() - start;
      expect(r.ok).toBe(false);
      expect(elapsed).toBeLessThan(5000);
    }
  });

  it("waits indefinitely when deadlineMs is undefined (succeeds eventually)", async () => {
    let calls = 0;
    const start = Date.now();
    const r = await waitForReady({
      probe: async () => ++calls >= 5,
      // deadlineMs intentionally omitted
      pollIntervalMs: 30,
    });
    const elapsed = Date.now() - start;
    expect(r.ok).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(5);
    // ~5 polls at 30ms interval ≈ 120–180ms. Just ensure we're not
    // short-circuiting suspiciously fast or hanging absurdly long.
    expect(elapsed).toBeLessThan(2000);
  });

  it("waits indefinitely until child crashes (no deadline, child-exit wins)", async () => {
    // Spawn a short-lived child that exits non-zero after ~200ms.
    const bad = await spawnDetached({
      cmd: process.execPath,
      args: ["-e", "setTimeout(() => process.exit(1), 200)"],
    });
    expect(bad.ok).toBe(true);
    const start = Date.now();
    const r = await waitForReady({
      probe: async () => false, // never ready
      // deadlineMs intentionally omitted — relies on child-exit
      pollIntervalMs: 50,
      child: bad.process!,
    });
    const elapsed = Date.now() - start;
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/child exited/);
    expect(elapsed).toBeLessThan(2000); // short-circuited, not stuck
  });

  it("polls at pollIntervalMs until probe flips", async () => {
    let calls = 0;
    const r = await waitForReady({
      probe: async () => ++calls >= 3,
      deadlineMs: 2000,
      pollIntervalMs: 50,
    });
    expect(r.ok).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(3);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ══  Tests merged from platform-exec.test.ts (pre-consolidation)           ══
// ════════════════════════════════════════════════════════════════════════════

import { execSync, spawn, spawnSync, exec, execFile } from "../platform/spawn.js";

describe("platform/exec wrappers", () => {
  // ── execSync ────────────────────────────────────────────────────────────
  // Real invocation: we pick commands that exit 0 on every OS (node itself).

  it("execSync exits 0 for `node --version`", () => {
    const out = execSync(`"${process.execPath}" --version`, { encoding: "utf-8" });
    expect(String(out).trim()).toMatch(/^v\d+\.\d+\.\d+/);
  });

  // ── spawnSync ───────────────────────────────────────────────────────────

  it("spawnSync runs `node --version` and captures stdout", () => {
    const result = spawnSync(process.execPath, ["--version"], { encoding: "utf-8" });
    expect(result.status).toBe(0);
    expect(String(result.stdout).trim()).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it("spawnSync accepts undefined args and defaults to []", () => {
    // Should not throw — wrapper must coerce undefined args to []
    const result = spawnSync(process.execPath, undefined, {
      encoding: "utf-8",
      input: "process.stdout.write('ok')",
    });
    // May or may not work depending on shell, but the call itself must not throw.
    expect(typeof result).toBe("object");
  });

  // ── windowsHide default ─────────────────────────────────────────────────

  // The key invariant: wrappers set windowsHide: true when caller omits it.
  // We verify this by inspecting the spawn metadata (spawnargs / opts).
  // Node doesn't expose the final options object, so we check by spawning
  // with a non-overridden call and verifying it completes successfully
  // (a misconfigured windowsHide would not change functional behavior,
  // so the real assertion is in D10 below via source inspection).

  it("spawn returns a ChildProcess object", async () => {
    const child = spawn(process.execPath, ["--version"]);
    expect(child.pid).toBeGreaterThan(0);
    await new Promise<void>((resolve) => {
      child.on("exit", () => resolve());
    });
  });

  // ── exec (callback form) ────────────────────────────────────────────────

  it("exec(cmd, cb) invokes callback with stdout", async () => {
    const out = await new Promise<string>((resolve, reject) => {
      exec(`"${process.execPath}" --version`, (err, stdout) => {
        if (err) reject(err);
        else resolve(String(stdout));
      });
    });
    expect(out.trim()).toMatch(/^v\d+\.\d+\.\d+/);
  });

  // ── execFile ────────────────────────────────────────────────────────────

  it("execFile(file, args, cb) works", async () => {
    const out = await new Promise<string>((resolve, reject) => {
      execFile(process.execPath, ["--version"], (err, stdout) => {
        if (err) reject(err);
        else resolve(String(stdout));
      });
    });
    expect(out.trim()).toMatch(/^v\d+\.\d+\.\d+/);
  });
});

describe("platform/exec — windowsHide default (source-level assertion)", () => {
  // Since Node doesn't expose the spawn options after the call, we verify
  // the windowsHide default by reading the wrapper source and asserting
  // that every public export merges `windowsHide: true` into its options.
  //
  // This catches refactors that accidentally drop the default.

  it("exec.ts source sets windowsHide: true by default", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = await fs.readFile(path.resolve(here, "../platform/spawn.ts"), "utf-8");

    // Must define a withHide helper and apply it uniformly.
    expect(src).toMatch(/windowsHide\??:\s*boolean/);
    expect(src).toMatch(/windowsHide:\s*hide/);
    // Default must be true (not false) when caller omits it.
    expect(src).toMatch(/opts\?\.windowsHide\s*\?\?\s*true/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ══  Tests merged from spawn-mechanism.test.ts (pre-consolidation)         ══
// ════════════════════════════════════════════════════════════════════════════

import {
  selectMechanism,
  buildWtArgs,
  sessionFlagsToArgv,
  type SpawnMechanismContext,
} from "../platform/spawn.js";

function ctx(overrides: Partial<SpawnMechanismContext> = {}): SpawnMechanismContext {
  return {
    platform: "linux",
    userStrategy: "tmux",
    electronMode: false,
    available: { tmux: false, wt: false, wslTmux: false },
    ...overrides,
  };
}

describe("selectMechanism", () => {
  it("electron mode always returns headless", () => {
    expect(selectMechanism(ctx({ electronMode: true, platform: "win32", available: { tmux: false, wt: true, wslTmux: true } }))).toBe("headless");
    expect(selectMechanism(ctx({ electronMode: true, platform: "linux", available: { tmux: true, wt: false, wslTmux: false } }))).toBe("headless");
    expect(selectMechanism(ctx({ electronMode: true, platform: "darwin", available: { tmux: true, wt: false, wslTmux: false } }))).toBe("headless");
  });

  it("userStrategy headless always returns headless", () => {
    expect(selectMechanism(ctx({ userStrategy: "headless", platform: "win32", available: { tmux: false, wt: true, wslTmux: true } }))).toBe("headless");
    expect(selectMechanism(ctx({ userStrategy: "headless", platform: "linux", available: { tmux: true, wt: false, wslTmux: false } }))).toBe("headless");
  });

  it("Linux with tmux returns tmux", () => {
    expect(selectMechanism(ctx({ platform: "linux", available: { tmux: true, wt: false, wslTmux: false } }))).toBe("tmux");
  });

  it("macOS with tmux returns tmux", () => {
    expect(selectMechanism(ctx({ platform: "darwin", available: { tmux: true, wt: false, wslTmux: false } }))).toBe("tmux");
  });

  it("Linux without tmux returns headless", () => {
    expect(selectMechanism(ctx({ platform: "linux", available: { tmux: false, wt: false, wslTmux: false } }))).toBe("headless");
  });

  it("Windows with wt returns wt", () => {
    expect(selectMechanism(ctx({ platform: "win32", available: { tmux: false, wt: true, wslTmux: false } }))).toBe("wt");
  });

  it("Windows with wt AND wsl-tmux prefers wt", () => {
    expect(selectMechanism(ctx({ platform: "win32", available: { tmux: false, wt: true, wslTmux: true } }))).toBe("wt");
  });

  it("Windows with only wsl-tmux returns wsl-tmux", () => {
    expect(selectMechanism(ctx({ platform: "win32", available: { tmux: false, wt: false, wslTmux: true } }))).toBe("wsl-tmux");
  });

  it("Windows with nothing available returns headless", () => {
    expect(selectMechanism(ctx({ platform: "win32", available: { tmux: false, wt: false, wslTmux: false } }))).toBe("headless");
  });

  it("unknown platform falls back to headless", () => {
    expect(selectMechanism(ctx({ platform: "openbsd" as NodeJS.Platform, available: { tmux: true, wt: false, wslTmux: false } }))).toBe("headless");
  });
});

describe("buildWtArgs", () => {
  it("produces argv in expected order", () => {
    const argv = buildWtArgs({
      cwd: "C:\\proj",
      title: "proj",
      piArgv: ["C:\\node.exe", "cli.js", "--mode", "rpc"],
    });
    expect(argv).toEqual([
      "-w", "0",
      "new-tab",
      "-d", "C:\\proj",
      "--title", "proj",
      "--",
      "C:\\node.exe", "cli.js", "--mode", "rpc",
    ]);
  });

  it("preserves cwd with spaces as a single argv element", () => {
    const argv = buildWtArgs({
      cwd: "C:\\Users\\Bob's Project (2)",
      title: "x",
      piArgv: ["pi"],
    });
    expect(argv).toContain("C:\\Users\\Bob's Project (2)");
    expect(argv.filter(a => a.includes("Bob"))).toHaveLength(1);
  });

  it("places piArgv after -- sentinel with --fork intact", () => {
    const argv = buildWtArgs({
      cwd: "C:\\proj",
      title: "proj",
      piArgv: ["node.exe", "cli.js", "--fork", "C:\\x\\session.jsonl"],
    });
    const sentinelIdx = argv.indexOf("--");
    expect(sentinelIdx).toBeGreaterThan(0);
    expect(argv.slice(sentinelIdx + 1)).toEqual(["node.exe", "cli.js", "--fork", "C:\\x\\session.jsonl"]);
  });

  it("never includes -p profile flag", () => {
    const argv = buildWtArgs({ cwd: "C:\\x", title: "y", piArgv: ["pi"] });
    expect(argv).not.toContain("-p");
  });
});

describe("sessionFlagsToArgv", () => {
  it("returns --session file for continue mode", () => {
    expect(sessionFlagsToArgv({ sessionFile: "/s/abc.jsonl", mode: "continue" })).toEqual(["--session", "/s/abc.jsonl"]);
  });

  it("returns --fork file for fork mode", () => {
    expect(sessionFlagsToArgv({ sessionFile: "C:\\s\\abc.jsonl", mode: "fork" })).toEqual(["--fork", "C:\\s\\abc.jsonl"]);
  });

  it("returns empty array with no file", () => {
    expect(sessionFlagsToArgv({})).toEqual([]);
    expect(sessionFlagsToArgv({ mode: "continue" })).toEqual([]);
    expect(sessionFlagsToArgv({ mode: "fork" })).toEqual([]);
  });

  it("returns empty array with file but no mode", () => {
    expect(sessionFlagsToArgv({ sessionFile: "/s/x.jsonl" })).toEqual([]);
  });
});
