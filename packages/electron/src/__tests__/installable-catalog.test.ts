/**
 * installable-catalog.test.ts — catalog assembly with mock resources.
 *
 * Covers Group 9 of streamline-electron-bootstrap-and-recovery:
 *   - core tier reading from offline-packages/manifest.json
 *   - extension tier enumeration from bundled-extensions/<id>/
 *   - graceful no-op when resources are absent (dev builds)
 *   - shape contract (kind / source / required / schemaVersion)
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assembleCatalog,
  readBundledExtensionsFromGitCache,
  readCoreFromOfflinePackagesJson,
} from "../lib/installable-catalog.js";

let resourcesPath: string;

function seedOfflineManifest(
  pins: Array<{ name: string; version: string }>,
): void {
  const dir = path.join(resourcesPath, "offline-packages");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({ platform: "test", pins }, null, 2),
  );
}

function seedBundledExtension(
  id: string,
  manifest: { name: string; version: string },
): void {
  const dir = path.join(resourcesPath, "bundled-extensions", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(manifest, null, 2),
  );
}

beforeEach(() => {
  resourcesPath = mkdtempSync(path.join(tmpdir(), "pi-catalog-test-"));
});

afterEach(() => {
  rmSync(resourcesPath, { recursive: true, force: true });
});

describe("readCoreFromOfflinePackagesJson", () => {
  it("emits one core row per pin", () => {
    seedOfflineManifest([
      { name: "@earendil-works/pi-coding-agent", version: "0.74.0" },
      { name: "@fission-ai/openspec", version: "1.3.1" },
      { name: "tsx", version: "4.22.0" },
    ]);
    const result = readCoreFromOfflinePackagesJson(resourcesPath);
    expect(result).toHaveLength(3);
    for (const row of result) {
      expect(row.required).toBe(true);
      expect(row.kind).toBe("npm");
      expect(row.source).toBe("offline-cache");
    }
    expect(result[0].name).toBe("@earendil-works/pi-coding-agent");
    expect(result[0].version).toBe("0.74.0");
  });

  it("tolerates legacy `packages` field shape", () => {
    const dir = path.join(resourcesPath, "offline-packages");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ packages: [{ name: "tsx", version: "4.22.0" }] }),
    );
    const result = readCoreFromOfflinePackagesJson(resourcesPath);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("tsx");
  });

  it("returns [] when manifest absent (dev build)", () => {
    expect(readCoreFromOfflinePackagesJson(resourcesPath)).toEqual([]);
  });

  it("returns [] when manifest is corrupt JSON", () => {
    const dir = path.join(resourcesPath, "offline-packages");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "manifest.json"), "{not valid json");
    expect(readCoreFromOfflinePackagesJson(resourcesPath)).toEqual([]);
  });
});

describe("readBundledExtensionsFromGitCache", () => {
  it("emits one extension row per bundled-extensions/<id>/ entry", () => {
    seedBundledExtension("pi-anthropic-messages", {
      name: "@blackbelt-technology/pi-anthropic-messages",
      version: "1.2.3",
    });
    seedBundledExtension("pi-flows", {
      name: "@blackbelt-technology/pi-flows",
      version: "0.5.0",
    });
    const result = readBundledExtensionsFromGitCache(resourcesPath);
    expect(result).toHaveLength(2);
    for (const row of result) {
      expect(row.required).toBe(false);
      expect(row.kind).toBe("pi-extension");
      expect(row.source).toBe("bundled-git");
    }
  });

  it("sorts results by name for deterministic ordering", () => {
    seedBundledExtension("pi-zeta", { name: "z-pkg", version: "1.0.0" });
    seedBundledExtension("pi-alpha", { name: "a-pkg", version: "1.0.0" });
    seedBundledExtension("pi-mid", { name: "m-pkg", version: "1.0.0" });
    const result = readBundledExtensionsFromGitCache(resourcesPath);
    expect(result.map((r) => r.name)).toEqual(["a-pkg", "m-pkg", "z-pkg"]);
  });

  it("skips directories without package.json", () => {
    const dir = path.join(resourcesPath, "bundled-extensions", "orphan");
    mkdirSync(dir, { recursive: true });
    expect(readBundledExtensionsFromGitCache(resourcesPath)).toEqual([]);
  });

  it("skips entries with corrupt package.json", () => {
    const dir = path.join(resourcesPath, "bundled-extensions", "broken");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "package.json"), "{not json");
    expect(readBundledExtensionsFromGitCache(resourcesPath)).toEqual([]);
  });

  it("skips entries missing name or version", () => {
    seedBundledExtension("nameless", { name: "", version: "1.0.0" });
    seedBundledExtension("versionless", { name: "x", version: "" });
    expect(readBundledExtensionsFromGitCache(resourcesPath)).toEqual([]);
  });

  it("returns [] when bundled-extensions dir absent (dev build)", () => {
    expect(readBundledExtensionsFromGitCache(resourcesPath)).toEqual([]);
  });
});

describe("assembleCatalog", () => {
  it("emits schemaVersion 2 envelope with combined tiers", () => {
    seedOfflineManifest([
      { name: "@earendil-works/pi-coding-agent", version: "0.74.0" },
    ]);
    seedBundledExtension("pi-flows", {
      name: "@blackbelt-technology/pi-flows",
      version: "0.5.0",
    });
    const list = assembleCatalog({ resourcesPath });
    expect(list.schemaVersion).toBe(2);
    expect(list.version).toBe("1.0");
    expect(list.packages).toHaveLength(2);
    // Core comes before extensions in assembly order.
    expect(list.packages[0].source).toBe("offline-cache");
    expect(list.packages[1].source).toBe("bundled-git");
  });

  it("produces empty list when nothing is bundled (dev build)", () => {
    const list = assembleCatalog({ resourcesPath });
    expect(list.schemaVersion).toBe(2);
    expect(list.packages).toEqual([]);
  });

  it("does not include any npm-registry-source entries", () => {
    seedOfflineManifest([{ name: "tsx", version: "4.22.0" }]);
    seedBundledExtension("pi-flows", {
      name: "@blackbelt-technology/pi-flows",
      version: "0.5.0",
    });
    const list = assembleCatalog({ resourcesPath });
    for (const row of list.packages) {
      expect(row.source).not.toBe("npm-registry");
    }
  });
});
