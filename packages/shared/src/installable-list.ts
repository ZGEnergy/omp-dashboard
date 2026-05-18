/**
 * installable-list.ts — types and helpers for ~/.pi/dashboard/installable.json.
 *
 * This file describes the set of packages the dashboard needs installed.
 * Electron seeds the file on first run; Bridge / Standalone ignore it (file-absent
 * path is a no-op in the server bootstrap). The server reads it during bootstrap.
 *
 * Schema versions:
 *   - v1 (legacy): no `schemaVersion` field. Entries have `name`, `version`,
 *     `required`, `kind`, optional `deprecated`/`defaultOff`.
 *   - v2: `schemaVersion: 2` envelope marker. Entries additionally carry
 *     `source: "offline-cache" | "bundled-git" | "npm-registry"` describing
 *     install provenance. v1 files are migrated in memory at read time; the
 *     file is rewritten in v2 form on the next mutation.
 *
 * See change: streamline-electron-bootstrap-and-recovery.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ELECTRON_OWNED_PACKAGES } from "./managed-package-whitelist.js";

export type InstallableKind = "npm" | "pi-extension";
export type InstallableSource = "offline-cache" | "bundled-git" | "npm-registry";

export interface InstallablePackage {
  name: string;
  /** Semver range or "*". */
  version: string;
  required: boolean;
  kind: InstallableKind;
  deprecated?: boolean;
  defaultOff?: boolean;
  /**
   * v2 field: install-source provenance. Drives routing in the server-side
   * bootstrap reconciler. Absent on v1 files; synthesized in memory by
   * `readInstallableList` per the migration rules documented above.
   */
  source?: InstallableSource;
}

export interface InstallableList {
  /** Free-form content version string (e.g. "1.0"). NOT the schema marker. */
  version: string;
  packages: InstallablePackage[];
  /** v2 schema marker. Absent on v1 files; set to 2 after migration. */
  schemaVersion?: 2;
}

export interface MergeResult {
  list: InstallableList;
  warnings: string[];
}

const VALID_KINDS: ReadonlySet<string> = new Set<InstallableKind>(["npm", "pi-extension"]);

function defaultConfigDir(): string {
  return path.join(os.homedir(), ".pi", "dashboard");
}

function installablePath(configDir: string): string {
  return path.join(configDir, "installable.json");
}

/**
 * Pure migration: synthesize the v2 `source` field on a single entry when
 * absent. v1 → v2 inference rules:
 *   - Package name is in `ELECTRON_OWNED_PACKAGES` → `source: "offline-cache"`
 *   - Otherwise, `kind == "pi-extension"` → `source: "bundled-git"`
 *   - Otherwise (kind == "npm" non-whitelist) → `source: "npm-registry"`
 *
 * Exported for unit tests; called internally by `readInstallableList`.
 */
export function inferSourceForPackage(pkg: InstallablePackage): InstallableSource {
  if (pkg.source) return pkg.source;
  if (ELECTRON_OWNED_PACKAGES.has(pkg.name)) return "offline-cache";
  if (pkg.kind === "pi-extension") return "bundled-git";
  return "npm-registry";
}

/**
 * Pure migration of an entire list: stamps `schemaVersion: 2` and fills in
 * `source` per entry. Idempotent: a v2 input is returned unchanged.
 */
export function migrateToV2(list: InstallableList): InstallableList {
  if (list.schemaVersion === 2) return list;
  return {
    ...list,
    schemaVersion: 2,
    packages: list.packages.map((p) =>
      p.source ? p : { ...p, source: inferSourceForPackage(p) },
    ),
  };
}

/**
 * Read `~/.pi/dashboard/installable.json` (or `configDir/installable.json`).
 *
 * Returns `null` when the file is absent. Logs a warning and drops entries
 * with an invalid `kind` field. Does NOT create the file. v1 files (missing
 * `schemaVersion`) are migrated to v2 in memory; the file on disk is left
 * untouched until the next mutation through `writeInstallableList`.
 */
export async function readInstallableList(
  configDir?: string,
): Promise<InstallableList | null> {
  const dir = configDir ?? defaultConfigDir();
  const filePath = installablePath(dir);

  let raw: string;
  try {
    raw = await fs.promises.readFile(filePath, "utf-8");
  } catch (err: any) {
    if (err.code === "ENOENT") return null;
    throw err;
  }

  let parsed: InstallableList;
  try {
    parsed = JSON.parse(raw) as InstallableList;
  } catch (err: any) {
    console.warn(
      `[installable-list] Failed to parse "${filePath}": ${err?.message ?? err}. Treating as absent.`,
    );
    return null;
  }

  const validPackages: InstallablePackage[] = [];
  for (const pkg of parsed.packages ?? []) {
    if (!VALID_KINDS.has(pkg.kind)) {
      console.warn(
        `[installable-list] Dropping entry "${pkg.name}" with unknown kind "${pkg.kind}".`,
      );
      continue;
    }
    validPackages.push(pkg);
  }

  const cleaned: InstallableList = {
    version: parsed.version,
    packages: validPackages,
    schemaVersion: parsed.schemaVersion,
  };
  return migrateToV2(cleaned);
}

/**
 * Atomically write `list` to `configDir/installable.json`.
 * Writes a temp file then renames so readers never see a partial write.
 */
export async function writeInstallableList(
  list: InstallableList,
  configDir?: string,
): Promise<void> {
  const dir = configDir ?? defaultConfigDir();
  const filePath = installablePath(dir);
  const tmpPath = filePath + ".tmp." + process.pid;

  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(tmpPath, JSON.stringify(list, null, 2), "utf-8");
  await fs.promises.rename(tmpPath, filePath);
}

/**
 * Pure merge: reconcile a user's `existing` list against the `bundled` defaults.
 *
 * Rules:
 * - Package in both: keep user's pinned version (user wins); emit a warning when
 *   the bundled default differs.
 * - Package in existing but NOT in bundled: keep it, set `deprecated: true`, emit warning.
 * - New `required: true` package in bundled: add it.
 * - New `required: false` package in bundled: add it with `defaultOff: true`.
 * - Result version marker comes from `bundled.version`.
 */
export function mergeInstallableList(
  existing: InstallableList,
  bundled: InstallableList,
): MergeResult {
  const warnings: string[] = [];
  const bundledMap = new Map(bundled.packages.map((p) => [p.name, p]));
  const existingMap = new Map(existing.packages.map((p) => [p.name, p]));

  const merged: InstallablePackage[] = [];

  // Walk existing packages.
  for (const pkg of existing.packages) {
    const bundledPkg = bundledMap.get(pkg.name);
    if (!bundledPkg) {
      // Dropped in bundled → deprecate.
      warnings.push(
        `Package "${pkg.name}" is no longer in the bundled list and has been marked deprecated.`,
      );
      merged.push({ ...pkg, deprecated: true });
    } else {
      // Present in both → user version wins.
      if (pkg.version !== bundledPkg.version) {
        warnings.push(
          `Package "${pkg.name}" is pinned at "${pkg.version}" (bundled default: "${bundledPkg.version}"). User pin preserved.`,
        );
      }
      merged.push({ ...pkg });
    }
  }

  // Walk bundled packages not yet in existing.
  for (const bundledPkg of bundled.packages) {
    if (existingMap.has(bundledPkg.name)) continue;
    if (!bundledPkg.required) {
      merged.push({ ...bundledPkg, defaultOff: true });
    } else {
      merged.push({ ...bundledPkg });
    }
  }

  return {
    list: { version: bundled.version, packages: merged },
    warnings,
  };
}
