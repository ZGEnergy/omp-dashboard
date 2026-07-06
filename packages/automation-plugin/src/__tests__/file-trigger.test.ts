/**
 * File trigger: fires per new file with its path; parse validation; settle.
 * Uses a fake watcher (deterministic event control) + real tmp files for
 * existence checks. See change: wire-flow-inputs-in-automation.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeFileTrigger, type DirWatcher } from "../server/file-trigger.js";
import type { ArmDeps, FireContext } from "../server/trigger-registry.js";

const armDeps: ArmDeps = { now: () => 111, setTimer: (fn) => ({ clear: () => {} }) };

/** Fake watcher whose `change` handler we can invoke synchronously. */
function fakeWatch() {
  let changeCb: ((eventType: string, filename: string) => void) | null = null;
  let closed = false;
  const watcher: DirWatcher = {
    on(event, cb) {
      if (event === "change") changeCb = cb as typeof changeCb;
    },
    close() {
      closed = true;
    },
  };
  return {
    factory: () => watcher,
    emit: (eventType: string, filename: string) => changeCb?.(eventType, filename),
    isClosed: () => closed,
  };
}

describe("file trigger parse", () => {
  const t = makeFileTrigger();
  it("accepts a non-empty path and defaults events to [created]", () => {
    expect(t.parse({ kind: "file", path: "/spool" })).toEqual({
      path: "/spool",
      events: ["created"],
      settle: "rename-only",
    });
  });
  it("keeps selected valid events", () => {
    expect(t.parse({ kind: "file", path: "/spool", events: ["created", "deleted"] }).events).toEqual([
      "created",
      "deleted",
    ]);
  });
  it("throws when path is missing or empty (isolation)", () => {
    expect(() => t.parse({ kind: "file" })).toThrow(/non-empty `path`/);
    expect(() => t.parse({ kind: "file", path: "  " })).toThrow(/non-empty `path`/);
  });
});

describe("file trigger arm (fake watcher + real files)", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "file-trig-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fires once per new file with its absolute path", () => {
    const fired: FireContext[] = [];
    const w = fakeWatch();
    const t = makeFileTrigger(w.factory);
    const d = t.arm({ path: dir, events: ["created"], settle: "rename-only" }, (c) => fired.push(c), armDeps);

    fs.writeFileSync(path.join(dir, "inv-042.pdf"), "x");
    w.emit("rename", "inv-042.pdf");
    w.emit("rename", "inv-042.pdf"); // duplicate event → no double fire

    expect(fired).toHaveLength(1);
    expect(fired[0]).toEqual({ firedAt: 111, value: path.join(dir, "inv-042.pdf") });
    d.dispose();
    expect(w.isClosed()).toBe(true);
  });

  it("fires independently for each file", () => {
    const fired: unknown[] = [];
    const w = fakeWatch();
    const t = makeFileTrigger(w.factory);
    t.arm({ path: dir, events: ["created"], settle: "rename-only" }, (c) => fired.push(c.value), armDeps);

    fs.writeFileSync(path.join(dir, "a.pdf"), "1");
    w.emit("rename", "a.pdf");
    fs.writeFileSync(path.join(dir, "b.pdf"), "2");
    w.emit("rename", "b.pdf");

    expect(fired).toEqual([path.join(dir, "a.pdf"), path.join(dir, "b.pdf")]);
  });

  it("rename-only ignores change events for a created watch (in-progress writes)", () => {
    const fired: unknown[] = [];
    const w = fakeWatch();
    const t = makeFileTrigger(w.factory);
    t.arm({ path: dir, events: ["created"], settle: "rename-only" }, (c) => fired.push(c.value), armDeps);

    fs.writeFileSync(path.join(dir, "partial.pdf"), "half");
    w.emit("change", "partial.pdf"); // mid-write change → ignored
    expect(fired).toHaveLength(0);

    w.emit("rename", "partial.pdf"); // atomic settle → fires once
    expect(fired).toEqual([path.join(dir, "partial.pdf")]);
  });

  it("does not fire created for a rename of a non-existent entry (delete)", () => {
    const fired: unknown[] = [];
    const w = fakeWatch();
    const t = makeFileTrigger(w.factory);
    t.arm({ path: dir, events: ["created"], settle: "rename-only" }, (c) => fired.push(c.value), armDeps);
    w.emit("rename", "gone.pdf"); // never existed
    expect(fired).toHaveLength(0);
  });
});
