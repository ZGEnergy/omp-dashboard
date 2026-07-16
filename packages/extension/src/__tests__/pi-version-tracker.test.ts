/**
 * Tests for `sendPiVersionIfChanged` — bridge-side pi-version reporting.
 * See change: restore-pi-version-skew-surface.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendPiVersionIfChanged,
  _resetPiVersionCache,
  readPkgVersionByWalkUp,
  readPiVersionFromFilesystem,
} from "../model-tracker.js";
import type { BridgeContext } from "../bridge-context.js";

function makeBc() {
  const send = vi.fn();
  const bc = { sessionId: "sess-1", connection: { send } } as unknown as BridgeContext;
  return { bc, send };
}

describe("sendPiVersionIfChanged", () => {
  beforeEach(() => _resetPiVersionCache());

  it("pushes once on first read", () => {
    const { bc, send } = makeBc();
    sendPiVersionIfChanged(bc, () => "0.80.2");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: "pi_version_update", sessionId: "sess-1", version: "0.80.2" });
  });

  it("does not push when the version is unchanged", () => {
    const { bc, send } = makeBc();
    sendPiVersionIfChanged(bc, () => "0.80.2");
    sendPiVersionIfChanged(bc, () => "0.80.2");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("pushes again when the version changes (out-of-band upgrade)", () => {
    const { bc, send } = makeBc();
    sendPiVersionIfChanged(bc, () => "0.80.2");
    sendPiVersionIfChanged(bc, () => "0.81.0");
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({ type: "pi_version_update", sessionId: "sess-1", version: "0.81.0" });
  });

  it("read failure: no crash, no push, warns", () => {
    const { bc, send } = makeBc();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => sendPiVersionIfChanged(bc, () => { throw new Error("boom"); })).not.toThrow();
    expect(send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("undefined version: no push", () => {
    const { bc, send } = makeBc();
    sendPiVersionIfChanged(bc, () => undefined);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("readPkgVersionByWalkUp", () => {
  const PKG = "@earendil-works/pi-coding-agent";

  // Simulate a restrictive-exports install: resolve(".") lands on dist/index.js,
  // and package.json (omitting the ./package.json subpath) sits one level up.
  it("reads version by walking up when ./package.json subpath is not exported", () => {
    const root = "/node_modules/@earendil-works/pi-coding-agent";
    const entry = `${root}/dist/index.js`;
    const files: Record<string, string> = {
      [`${root}/package.json`]: JSON.stringify({ name: PKG, version: "0.80.2" }),
    };
    const v = readPkgVersionByWalkUp(
      PKG,
      () => entry,
      (p) => {
        const f = files[p];
        if (f === undefined) throw new Error(`ENOENT ${p}`);
        return f;
      },
      (p) => p in files,
    );
    expect(v).toBe("0.80.2");
  });

  it("skips a non-matching ancestor package.json (workspace root)", () => {
    const root = "/repo/node_modules/@earendil-works/pi-coding-agent";
    const entry = `${root}/dist/index.js`;
    const files: Record<string, string> = {
      "/repo/package.json": JSON.stringify({ name: "the-workspace", version: "9.9.9" }),
      [`${root}/package.json`]: JSON.stringify({ name: PKG, version: "0.80.2" }),
    };
    const v = readPkgVersionByWalkUp(
      PKG,
      () => entry,
      (p) => files[p] ?? (() => { throw new Error(`ENOENT ${p}`); })(),
      (p) => p in files,
    );
    expect(v).toBe("0.80.2");
  });

  it("returns undefined (no throw) when no matching manifest is found", () => {
    const v = readPkgVersionByWalkUp(
      PKG,
      () => "/nowhere/dist/index.js",
      () => { throw new Error("should not read"); },
      () => false,
    );
    expect(v).toBeUndefined();
  });
});

describe("readPiVersionFromFilesystem", () => {
  const PKG = "@earendil-works/pi-coding-agent";

  it("finds a hoisted workspace install by walking ancestors", () => {
    const files: Record<string, string> = {
      "/repo/node_modules/@earendil-works/pi-coding-agent/package.json":
        JSON.stringify({ name: PKG, version: "0.80.2" }),
    };
    const v = readPiVersionFromFilesystem(
      "/repo/packages/extension/src",
      (p) => files[p] ?? (() => { throw new Error(`ENOENT ${p}`); })(),
      (p) => p in files,
      "/home/nobody",
    );
    expect(v).toBe("0.80.2");
  });

  it("falls back to the managed dashboard install", () => {
    const files: Record<string, string> = {
      "/home/joe/.omp-dashboard/node_modules/@earendil-works/pi-coding-agent/package.json":
        JSON.stringify({ name: PKG, version: "0.79.0" }),
    };
    const v = readPiVersionFromFilesystem(
      "/home/joe/.omp-dashboard/packages/extension/src",
      (p) => files[p] ?? (() => { throw new Error(`ENOENT ${p}`); })(),
      (p) => p in files,
      "/home/joe",
    );
    expect(v).toBe("0.79.0");
  });

  it("returns undefined when nothing is installed", () => {
    const v = readPiVersionFromFilesystem(
      "/tmp/empty/src",
      () => { throw new Error("should not read"); },
      () => false,
      "/tmp/empty-home",
    );
    expect(v).toBeUndefined();
  });
});
