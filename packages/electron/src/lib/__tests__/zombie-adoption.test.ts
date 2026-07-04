/**
 * Unit tests for the zombie-adoption modal + stop sequence.
 * See change: electron-attach-ownership-fixes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const showMessageBox = vi.fn();

vi.mock("electron", () => ({
  dialog: { showMessageBox: (...args: unknown[]) => showMessageBox(...args) },
}));

import { promptZombieAdoption, stopZombieServer } from "../zombie-adoption-dialog.js";

describe("promptZombieAdoption", () => {
  beforeEach(() => showMessageBox.mockReset());

  it("button index 0 → adopt", async () => {
    showMessageBox.mockResolvedValue({ response: 0 });
    expect(await promptZombieAdoption({ pid: 123 })).toBe("adopt");
  });

  it("button index 1 → leave", async () => {
    showMessageBox.mockResolvedValue({ response: 1 });
    expect(await promptZombieAdoption({ pid: 123 })).toBe("leave");
  });

  it("button index 2 → stop", async () => {
    showMessageBox.mockResolvedValue({ response: 2 });
    expect(await promptZombieAdoption({ pid: 123 })).toBe("stop");
  });

  it("uses 'leave' as both default and cancel button", async () => {
    showMessageBox.mockResolvedValue({ response: 1 });
    await promptZombieAdoption({ pid: 999 });
    const opts = showMessageBox.mock.calls[0][0];
    expect(opts.defaultId).toBe(1);
    expect(opts.cancelId).toBe(1);
    expect(opts.detail).toContain("999");
  });
});

describe("stopZombieServer", () => {
  it("SIGTERM then stops after poll sees server gone (no SIGKILL)", async () => {
    const kill = vi.fn();
    let alive = true;
    const isRunning = vi.fn(async () => alive);
    const sleep = vi.fn(async () => { alive = false; }); // dies after first poll
    const ok = await stopZombieServer(1234, { kill, isRunning, sleep, timeoutMs: 5000, pollMs: 10 });
    expect(ok).toBe(true);
    expect(kill).toHaveBeenCalledWith(1234, "SIGTERM");
    expect(kill).not.toHaveBeenCalledWith(1234, "SIGKILL");
  });

  it("SIGKILL after timeout when server stays alive", async () => {
    const kill = vi.fn();
    const isRunning = vi.fn(async () => true); // never dies
    const sleep = vi.fn(async () => {});
    const ok = await stopZombieServer(1234, { kill, isRunning, sleep, timeoutMs: 20, pollMs: 5 });
    expect(ok).toBe(true);
    expect(kill).toHaveBeenCalledWith(1234, "SIGTERM");
    expect(kill).toHaveBeenCalledWith(1234, "SIGKILL");
  });

  it("returns true immediately when SIGTERM throws (already dead)", async () => {
    const kill = vi.fn(() => { throw new Error("ESRCH"); });
    const isRunning = vi.fn(async () => false);
    const sleep = vi.fn(async () => {});
    const ok = await stopZombieServer(1234, { kill, isRunning, sleep });
    expect(ok).toBe(true);
    expect(isRunning).not.toHaveBeenCalled();
  });
});
