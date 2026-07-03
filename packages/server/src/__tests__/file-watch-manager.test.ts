import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createFileWatchManager } from "../file-watch-manager.js";

const cleanup: string[] = [];
afterAll(() => {
  for (const r of cleanup) rmSync(r, { recursive: true, force: true });
});

function tmp(): string {
  const root = mkdtempSync(join(tmpdir(), "fwm-"));
  cleanup.push(root);
  return root;
}

/** Fake WebSocket key. */
const wsA = {} as any;
const wsB = {} as any;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("FileWatchManager", () => {
  it("fires onChange when a watched open file is written", async () => {
    const root = tmp();
    writeFileSync(join(root, "foo.ts"), "a");
    const onChange = vi.fn();
    const mgr = createFileWatchManager();

    mgr.setWatched(wsA, "s1", root, ["foo.ts"], onChange);
    await wait(50);
    writeFileSync(join(root, "foo.ts"), "b");
    await wait(150);

    expect(onChange).toHaveBeenCalledWith("s1", "foo.ts");
    mgr.clearConnection(wsA);
  });

  it("does not fire for a file that is not in the watched set", async () => {
    const root = tmp();
    writeFileSync(join(root, "foo.ts"), "a");
    writeFileSync(join(root, "bar.ts"), "a");
    const onChange = vi.fn();
    const mgr = createFileWatchManager();

    mgr.setWatched(wsA, "s1", root, ["foo.ts"], onChange);
    await wait(50);
    writeFileSync(join(root, "bar.ts"), "b");
    await wait(150);

    expect(onChange).not.toHaveBeenCalled();
    mgr.clearConnection(wsA);
  });

  it("reconciles the watched set — a removed path stops firing", async () => {
    const root = tmp();
    writeFileSync(join(root, "foo.ts"), "a");
    const onChange = vi.fn();
    const mgr = createFileWatchManager();

    mgr.setWatched(wsA, "s1", root, ["foo.ts"], onChange);
    await wait(50);
    mgr.setWatched(wsA, "s1", root, [], onChange); // drop foo.ts
    await wait(50);
    writeFileSync(join(root, "foo.ts"), "b");
    await wait(150);

    expect(onChange).not.toHaveBeenCalled();
    expect(mgr.activeWatchCount()).toBe(0);
    mgr.clearConnection(wsA);
  });

  it("clearConnection tears down all of a connection's watchers (no fd leak)", async () => {
    const root = tmp();
    writeFileSync(join(root, "foo.ts"), "a");
    const mgr = createFileWatchManager();

    mgr.setWatched(wsA, "s1", root, ["foo.ts"], vi.fn());
    mgr.setWatched(wsB, "s2", root, ["foo.ts"], vi.fn());
    expect(mgr.activeWatchCount()).toBe(2);

    mgr.clearConnection(wsA);
    expect(mgr.activeWatchCount()).toBe(1);
    mgr.clearConnection(wsB);
    expect(mgr.activeWatchCount()).toBe(0);
  });
});
