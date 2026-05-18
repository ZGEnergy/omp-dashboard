/**
 * Tests for preflight-reconcile.ts.
 *
 * Strategy: pure helpers use real fs in tmp dirs (memfs not needed; the fs
 * surface is tiny and the operations are sync). All test fixtures are
 * self-contained per test to avoid cross-test pollution.
 *
 * See change: streamline-electron-bootstrap-and-recovery.
 */
import { describe, expect, test, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  compareRunningServerVersion,
  compareWithPins,
  detectExistingPackageJsons,
  formatDiagnosis,
  readManagedInventory,
  readOfflinePackagePins,
  runPreflight,
} from "../lib/preflight-reconcile.js";

function tmpManagedDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "preflight-managed-"));
}

function seedPackage(managedDir: string, name: string, version: string): void {
  const pkgDir = path.join(managedDir, "node_modules", ...name.split("/"));
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({ name, version }, null, 2),
  );
}

function seedCorrupt(managedDir: string, name: string): void {
  const pkgDir = path.join(managedDir, "node_modules", ...name.split("/"));
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, "package.json"), "{not json");
}

function seedPinsManifest(resourcesPath: string): void {
  const dir = path.join(resourcesPath, "offline-packages");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      {
        bundledAt: "2026-01-01T00:00:00Z",
        targetPlatform: "test",
        tarball: "npm-cache.tar.gz",
        tarballBytes: 0,
        sha256: "0".repeat(64),
        packages: [
          { name: "@earendil-works/pi-coding-agent", version: "0.74.0" },
          { name: "@fission-ai/openspec", version: "1.3.1" },
          { name: "tsx", version: "4.22.0" },
        ],
      },
      null,
      2,
    ),
  );
}

// ── readManagedInventory ──────────────────────────────────────────────────

describe("readManagedInventory", () => {
  test("empty managed dir \u2192 all entries null", () => {
    const dir = tmpManagedDir();
    const inv = readManagedInventory(dir);
    expect(inv.get("@earendil-works/pi-coding-agent")).toBeNull();
    expect(inv.get("@fission-ai/openspec")).toBeNull();
    expect(inv.get("tsx")).toBeNull();
  });

  test("all three packages present \u2192 versions read", () => {
    const dir = tmpManagedDir();
    seedPackage(dir, "@earendil-works/pi-coding-agent", "0.74.0");
    seedPackage(dir, "@fission-ai/openspec", "1.3.1");
    seedPackage(dir, "tsx", "4.22.0");
    const inv = readManagedInventory(dir);
    expect(inv.get("@earendil-works/pi-coding-agent")).toBe("0.74.0");
    expect(inv.get("@fission-ai/openspec")).toBe("1.3.1");
    expect(inv.get("tsx")).toBe("4.22.0");
  });

  test("corrupt package.json \u2192 entry null", () => {
    const dir = tmpManagedDir();
    seedCorrupt(dir, "tsx");
    const inv = readManagedInventory(dir);
    expect(inv.get("tsx")).toBeNull();
  });

  test("package.json with no version field \u2192 entry null", () => {
    const dir = tmpManagedDir();
    const pkgDir = path.join(dir, "node_modules", "tsx");
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name: "tsx" }));
    const inv = readManagedInventory(dir);
    expect(inv.get("tsx")).toBeNull();
  });
});

// ── readOfflinePackagePins ────────────────────────────────────────────────

describe("readOfflinePackagePins", () => {
  test("no resourcesPath, no buildTimePinsPath \u2192 empty map", () => {
    const pins = readOfflinePackagePins({});
    expect(pins.size).toBe(0);
  });

  test("manifest present \u2192 pins parsed", () => {
    const resources = tmpManagedDir();
    seedPinsManifest(resources);
    const pins = readOfflinePackagePins({ resourcesPath: resources });
    expect(pins.get("@earendil-works/pi-coding-agent")).toBe("0.74.0");
    expect(pins.get("@fission-ai/openspec")).toBe("1.3.1");
    expect(pins.get("tsx")).toBe("4.22.0");
  });

  test("resourcesPath absent \u2192 falls back to buildTimePinsPath", () => {
    const buildDir = tmpManagedDir();
    const buildPath = path.join(buildDir, "offline-packages.json");
    fs.writeFileSync(
      buildPath,
      JSON.stringify({
        packages: [{ name: "tsx", version: "4.22.0" }],
      }),
    );
    const pins = readOfflinePackagePins({ buildTimePinsPath: buildPath });
    expect(pins.get("tsx")).toBe("4.22.0");
  });

  test("malformed JSON in candidate \u2192 falls through, returns empty when no fallback", () => {
    const resources = tmpManagedDir();
    const dir = path.join(resources, "offline-packages");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), "{not json");
    const pins = readOfflinePackagePins({ resourcesPath: resources });
    expect(pins.size).toBe(0);
  });
});

// ── compareWithPins ───────────────────────────────────────────────────────

describe("compareWithPins", () => {
  const allCurrent = new Map([
    ["@earendil-works/pi-coding-agent", "0.74.0"],
    ["@fission-ai/openspec", "1.3.1"],
    ["tsx", "4.22.0"],
  ]);
  const pins = new Map([
    ["@earendil-works/pi-coding-agent", "0.74.0"],
    ["@fission-ai/openspec", "1.3.1"],
    ["tsx", "4.22.0"],
  ]);

  test("all current \u2192 needsAction false", () => {
    const diff = compareWithPins(allCurrent, pins);
    expect(diff.needsAction).toBe(false);
    expect(diff.upToDate.length).toBe(3);
    expect(diff.missing.length + diff.stale.length + diff.corrupt.length).toBe(0);
  });

  test("one missing \u2192 needsAction true, missing list populated", () => {
    const inv = new Map(allCurrent);
    inv.set("tsx", null);
    const diff = compareWithPins(inv, pins);
    expect(diff.needsAction).toBe(true);
    expect(diff.missing).toEqual(["tsx"]);
    expect(diff.upToDate.length).toBe(2);
  });

  test("one stale \u2192 needsAction true, stale list populated", () => {
    const inv = new Map(allCurrent);
    inv.set("tsx", "4.0.0");
    const diff = compareWithPins(inv, pins);
    expect(diff.needsAction).toBe(true);
    expect(diff.stale).toEqual(["tsx"]);
  });

  test("corruptHint distinguishes missing from corrupt", () => {
    const inv = new Map(allCurrent);
    inv.set("tsx", null);
    const diff = compareWithPins(inv, pins, new Set(["tsx"]));
    expect(diff.corrupt).toEqual(["tsx"]);
    expect(diff.missing).toEqual([]);
  });

  test("empty pins map \u2192 all entries classified current (graceful degrade)", () => {
    const diff = compareWithPins(allCurrent, new Map());
    expect(diff.needsAction).toBe(false);
    expect(diff.upToDate.length).toBe(3);
  });

  test("scoped names handled correctly", () => {
    const inv = new Map([["@earendil-works/pi-coding-agent", "0.74.0"]]);
    const pinsMap = new Map([["@earendil-works/pi-coding-agent", "0.74.0"]]);
    const diff = compareWithPins(inv, pinsMap);
    expect(diff.upToDate).toEqual(["@earendil-works/pi-coding-agent"]);
  });
});

// ── runPreflight ──────────────────────────────────────────────────────────

describe("runPreflight", () => {
  test("populated managed dir + matching pins \u2192 needsAction false", () => {
    const managedDir = tmpManagedDir();
    seedPackage(managedDir, "@earendil-works/pi-coding-agent", "0.74.0");
    seedPackage(managedDir, "@fission-ai/openspec", "1.3.1");
    seedPackage(managedDir, "tsx", "4.22.0");
    const resourcesPath = tmpManagedDir();
    seedPinsManifest(resourcesPath);

    const diff = runPreflight({ managedDir, resourcesPath });
    expect(diff.needsAction).toBe(false);
  });

  test("populated managed dir + stale pin \u2192 stale detected", () => {
    const managedDir = tmpManagedDir();
    seedPackage(managedDir, "@earendil-works/pi-coding-agent", "0.69.0");
    seedPackage(managedDir, "@fission-ai/openspec", "1.3.1");
    seedPackage(managedDir, "tsx", "4.22.0");
    const resourcesPath = tmpManagedDir();
    seedPinsManifest(resourcesPath);

    const diff = runPreflight({ managedDir, resourcesPath });
    expect(diff.needsAction).toBe(true);
    expect(diff.stale).toEqual(["@earendil-works/pi-coding-agent"]);
  });

  test("corrupt vs missing disambiguated", () => {
    const managedDir = tmpManagedDir();
    seedCorrupt(managedDir, "tsx");
    seedPackage(managedDir, "@earendil-works/pi-coding-agent", "0.74.0");
    // openspec entirely missing.
    const resourcesPath = tmpManagedDir();
    seedPinsManifest(resourcesPath);

    const diff = runPreflight({ managedDir, resourcesPath });
    expect(diff.corrupt).toEqual(["tsx"]);
    expect(diff.missing).toEqual(["@fission-ai/openspec"]);
  });
});

// ── detectExistingPackageJsons ────────────────────────────────────────────

describe("detectExistingPackageJsons", () => {
  test("returns only existing whitelist entries", () => {
    const dir = tmpManagedDir();
    seedPackage(dir, "tsx", "1.0.0");
    seedCorrupt(dir, "@earendil-works/pi-coding-agent");
    const present = detectExistingPackageJsons(dir);
    expect(present.has("tsx")).toBe(true);
    expect(present.has("@earendil-works/pi-coding-agent")).toBe(true);
    expect(present.has("@fission-ai/openspec")).toBe(false);
  });
});

// ── formatDiagnosis ───────────────────────────────────────────────────────

describe("formatDiagnosis", () => {
  test("returns null when no action needed", () => {
    expect(
      formatDiagnosis({
        diffs: [],
        needsAction: false,
        upToDate: [],
        missing: [],
        stale: [],
        corrupt: [],
      }),
    ).toBeNull();
  });

  test("missing copy", () => {
    const text = formatDiagnosis({
      diffs: [{ pkg: "tsx", installed: null, expected: "4.22.0", status: "missing" }],
      needsAction: true,
      upToDate: [],
      missing: ["tsx"],
      stale: [],
      corrupt: [],
    });
    expect(text).toContain("Missing");
    expect(text).toContain("tsx");
    expect(text).toContain("offline cache");
  });

  test("stale copy includes version pair", () => {
    const text = formatDiagnosis({
      diffs: [{ pkg: "tsx", installed: "4.0.0", expected: "4.22.0", status: "stale" }],
      needsAction: true,
      upToDate: [],
      missing: [],
      stale: ["tsx"],
      corrupt: [],
    });
    expect(text).toContain("Outdated");
    expect(text).toContain("have 4.0.0");
    expect(text).toContain("want 4.22.0");
  });

  test("corrupt copy", () => {
    const text = formatDiagnosis({
      diffs: [{ pkg: "tsx", installed: null, expected: "4.22.0", status: "corrupt" }],
      needsAction: true,
      upToDate: [],
      missing: [],
      stale: [],
      corrupt: ["tsx"],
    });
    expect(text).toContain("Corrupt");
    expect(text).toContain("unreadable");
  });
});

// ── compareRunningServerVersion ───────────────────────────────────────────

describe("compareRunningServerVersion", () => {
  test("equal versions \u2192 match", () => {
    expect(compareRunningServerVersion("0.5.3", "0.5.3")).toBe("match");
  });

  test("'v' prefix tolerated", () => {
    expect(compareRunningServerVersion("v0.5.3", "0.5.3")).toBe("match");
  });

  test("running newer major", () => {
    expect(compareRunningServerVersion("1.0.0", "0.9.9")).toBe("running-newer");
  });

  test("running older minor", () => {
    expect(compareRunningServerVersion("0.5.0", "0.5.3")).toBe("running-older");
  });

  test("running newer patch", () => {
    expect(compareRunningServerVersion("0.5.4", "0.5.3")).toBe("running-newer");
  });

  test("pre-release outranks no-pre-release as older", () => {
    expect(compareRunningServerVersion("0.5.3-rc.1", "0.5.3")).toBe("running-older");
    expect(compareRunningServerVersion("0.5.3", "0.5.3-rc.1")).toBe("running-newer");
  });

  test("pre-release lexicographic compare", () => {
    expect(compareRunningServerVersion("0.5.3-rc.2", "0.5.3-rc.1")).toBe("running-newer");
    expect(compareRunningServerVersion("0.5.3-alpha.1", "0.5.3-rc.1")).toBe("running-older");
  });

  test("unparseable inputs \u2192 unknown", () => {
    expect(compareRunningServerVersion("not-a-version", "0.5.3")).toBe("unknown");
    expect(compareRunningServerVersion("0.5.3", "garbage")).toBe("unknown");
    expect(compareRunningServerVersion(null, "0.5.3")).toBe("unknown");
    expect(compareRunningServerVersion("0.5.3", undefined)).toBe("unknown");
  });
});
