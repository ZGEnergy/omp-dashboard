/**
 * Tests for installable-list v1 \u2192 v2 schema migration.
 *
 * See change: streamline-electron-bootstrap-and-recovery.
 */
import { describe, expect, test } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  inferSourceForPackage,
  migrateToV2,
  readInstallableList,
  writeInstallableList,
  type InstallableList,
  type InstallablePackage,
} from "../installable-list.js";

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "installable-v2-"));
}

const PI_CORE: InstallablePackage = {
  name: "@earendil-works/pi-coding-agent",
  version: "*",
  required: true,
  kind: "npm",
};
const OPENSPEC: InstallablePackage = {
  name: "@fission-ai/openspec",
  version: "*",
  required: true,
  kind: "npm",
};
const PI_EXT: InstallablePackage = {
  name: "@blackbelt/openspec-tools",
  version: "*",
  required: false,
  kind: "pi-extension",
};
const NPM_EXT: InstallablePackage = {
  name: "some-non-whitelist-npm-pkg",
  version: "^1.0.0",
  required: false,
  kind: "npm",
};

describe("inferSourceForPackage", () => {
  test("whitelist entry \u2192 offline-cache", () => {
    expect(inferSourceForPackage(PI_CORE)).toBe("offline-cache");
    expect(inferSourceForPackage(OPENSPEC)).toBe("offline-cache");
  });

  test("pi-extension (non-whitelist) \u2192 bundled-git", () => {
    expect(inferSourceForPackage(PI_EXT)).toBe("bundled-git");
  });

  test("npm (non-whitelist) \u2192 npm-registry", () => {
    expect(inferSourceForPackage(NPM_EXT)).toBe("npm-registry");
  });

  test("existing source preserved \u2014 no override", () => {
    const explicit: InstallablePackage = { ...PI_CORE, source: "npm-registry" };
    expect(inferSourceForPackage(explicit)).toBe("npm-registry");
  });
});

describe("migrateToV2", () => {
  test("v1 list \u2192 stamps schemaVersion + sources", () => {
    const v1: InstallableList = {
      version: "1.0",
      packages: [PI_CORE, PI_EXT, NPM_EXT],
    };
    const v2 = migrateToV2(v1);
    expect(v2.schemaVersion).toBe(2);
    expect(v2.packages[0]!.source).toBe("offline-cache");
    expect(v2.packages[1]!.source).toBe("bundled-git");
    expect(v2.packages[2]!.source).toBe("npm-registry");
  });

  test("v2 list \u2192 unchanged (idempotent)", () => {
    const v2: InstallableList = {
      version: "2.0",
      schemaVersion: 2,
      packages: [{ ...PI_CORE, source: "offline-cache" }],
    };
    const out = migrateToV2(v2);
    expect(out).toEqual(v2);
  });

  test("v1 list with mixed pre-set sources \u2014 only missing fields filled", () => {
    const v1: InstallableList = {
      version: "1.0",
      packages: [
        { ...PI_CORE, source: "npm-registry" }, // pre-set, kept
        PI_EXT, // inferred
      ],
    };
    const v2 = migrateToV2(v1);
    expect(v2.packages[0]!.source).toBe("npm-registry");
    expect(v2.packages[1]!.source).toBe("bundled-git");
  });
});

describe("readInstallableList migration round-trip", () => {
  test("missing file \u2192 null", async () => {
    const dir = tmpdir();
    const result = await readInstallableList(dir);
    expect(result).toBeNull();
  });

  test("corrupt JSON \u2192 null + warning", async () => {
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, "installable.json"), "{not json");
    const result = await readInstallableList(dir);
    expect(result).toBeNull();
  });

  test("v1 file \u2192 migrated in memory", async () => {
    const dir = tmpdir();
    const v1: InstallableList = {
      version: "1.0",
      packages: [PI_CORE, PI_EXT],
    };
    fs.writeFileSync(
      path.join(dir, "installable.json"),
      JSON.stringify(v1, null, 2),
    );
    const result = await readInstallableList(dir);
    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(2);
    expect(result!.packages[0]!.source).toBe("offline-cache");
    expect(result!.packages[1]!.source).toBe("bundled-git");
  });

  test("v1 file on disk NOT eagerly rewritten by read", async () => {
    const dir = tmpdir();
    const filePath = path.join(dir, "installable.json");
    const v1: InstallableList = {
      version: "1.0",
      packages: [PI_CORE],
    };
    const v1Text = JSON.stringify(v1, null, 2);
    fs.writeFileSync(filePath, v1Text);
    await readInstallableList(dir);
    const after = fs.readFileSync(filePath, "utf8");
    expect(after).toBe(v1Text);
  });

  test("v2 file \u2192 round-trips unchanged on write", async () => {
    const dir = tmpdir();
    const v2: InstallableList = {
      version: "2.0",
      schemaVersion: 2,
      packages: [{ ...PI_CORE, source: "offline-cache" }],
    };
    await writeInstallableList(v2, dir);
    const back = await readInstallableList(dir);
    expect(back).toEqual(v2);
  });

  test("v1 \u2192 migrated read \u2192 write yields v2 on disk", async () => {
    const dir = tmpdir();
    const v1: InstallableList = {
      version: "1.0",
      packages: [PI_CORE, PI_EXT],
    };
    fs.writeFileSync(
      path.join(dir, "installable.json"),
      JSON.stringify(v1, null, 2),
    );
    const migrated = await readInstallableList(dir);
    expect(migrated).not.toBeNull();
    await writeInstallableList(migrated!, dir);
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(dir, "installable.json"), "utf8"),
    );
    expect(onDisk.schemaVersion).toBe(2);
    expect(onDisk.packages.every((p: InstallablePackage) => !!p.source)).toBe(true);
  });
});
