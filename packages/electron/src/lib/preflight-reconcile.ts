/**
 * Preflight reconciliation — on every Electron launch, read the installed
 * version of each Electron-owned package from `~/.pi-dashboard/node_modules/`
 * and compare against the bundled offline-packages.json pin floor.
 *
 * The result drives three runtime surfaces:
 *   1. `main.ts` startup (server-not-running branch) — prompts the user to
 *      reinstall missing/stale packages before launching the server.
 *   2. `loading.html` recovery flow — surfaces the same diagnosis after a
 *      ~15s connection-failure timeout, with a one-click reinstall.
 *   3. Doctor diagnostic section — shows the full diff as informational rows.
 *
 * All helpers in this file are pure I/O (no spawn, no network). Performance
 * target: < 500ms cold, < 100ms warm. Implementation uses `fs.readFileSync`
 * exclusively — no `npm list`, no `node --version` child processes.
 *
 * See change: streamline-electron-bootstrap-and-recovery.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ELECTRON_OWNED_PACKAGES } from "@blackbelt-technology/pi-dashboard-shared/managed-package-whitelist.js";

/** Classification of a single whitelisted package's state on disk. */
export type PackageDiffStatus = "missing" | "stale" | "current" | "corrupt";

/** Per-package diff entry. */
export interface PackageDiff {
  pkg: string;
  installed: string | null; // null => missing or corrupt
  expected: string;
  status: PackageDiffStatus;
}

/** Aggregate result of `runPreflight` / `compareWithPins`. */
export interface InventoryDiff {
  diffs: PackageDiff[];
  /** True when any entry is non-current. */
  needsAction: boolean;
  /** Names of packages classified as `current` — pass to installStandalone's skipPackages. */
  upToDate: string[];
  /** Names of packages classified as `missing`. */
  missing: string[];
  /** Names of packages classified as `stale`. */
  stale: string[];
  /** Names of packages classified as `corrupt`. */
  corrupt: string[];
}

/**
 * Pure I/O: read every whitelist entry's `package.json` and return
 * `Map<pkgName, installedVersion | null>`. `null` indicates missing OR corrupt
 * (cannot distinguish at this layer; downstream classifies via existsSync).
 *
 * Exported for direct use by Doctor diagnostics; most callers go through
 * `runPreflight` which combines this with the pin lookup + classification.
 */
export function readManagedInventory(managedDir: string): Map<string, string | null> {
  const inventory = new Map<string, string | null>();
  for (const pkg of ELECTRON_OWNED_PACKAGES) {
    const pkgJsonPath = path.join(
      managedDir,
      "node_modules",
      ...pkg.split("/"),
      "package.json",
    );
    if (!existsSync(pkgJsonPath)) {
      inventory.set(pkg, null);
      continue;
    }
    try {
      const text = readFileSync(pkgJsonPath, "utf8");
      const parsed = JSON.parse(text) as { version?: string };
      inventory.set(pkg, typeof parsed.version === "string" ? parsed.version : null);
    } catch {
      // Corrupt JSON or unreadable. Same null mapping; classification uses
      // the explicit existence-vs-readability split below.
      inventory.set(pkg, null);
    }
  }
  return inventory;
}

/**
 * Pure I/O: read pinned versions from
 * `<resourcesPath>/offline-packages/manifest.json`. Falls back to the build-
 * time `packages/electron/offline-packages.json` when resources/ is absent
 * (dev builds, standalone CLI).
 *
 * Returns an empty map if neither source is available; callers SHOULD treat
 * this as "preflight disabled" rather than an error.
 */
export function readOfflinePackagePins(opts: {
  resourcesPath?: string;
  /** Fallback path for dev builds. Resolved against repo root by caller. */
  buildTimePinsPath?: string;
}): Map<string, string> {
  const pins = new Map<string, string>();

  const candidates: string[] = [];
  if (opts.resourcesPath) {
    candidates.push(path.join(opts.resourcesPath, "offline-packages", "manifest.json"));
  }
  if (opts.buildTimePinsPath) {
    candidates.push(opts.buildTimePinsPath);
  }

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const raw = readFileSync(candidate, "utf8");
      const parsed = JSON.parse(raw) as {
        packages?: Array<{ name?: string; version?: string }>;
      };
      for (const entry of parsed.packages ?? []) {
        if (entry.name && entry.version) {
          pins.set(entry.name, entry.version);
        }
      }
      if (pins.size > 0) return pins;
    } catch {
      // Try next candidate.
    }
  }
  return pins;
}

/**
 * Pure logic: classify each whitelist entry as current / stale / missing /
 * corrupt against the supplied pin map. The corruption signal comes from
 * the caller passing `corruptHint`: a set of package names whose
 * `package.json` exists but failed to parse.
 *
 * `readManagedInventory` collapses missing + corrupt into the same `null`
 * mapping. Callers needing to distinguish must compute the corrupt set
 * themselves (e.g. by checking `existsSync` independently). For the basic
 * "needs reinstall?" question this distinction does not matter — both
 * trigger a reinstall — so the default `runPreflight` ignores it.
 */
export function compareWithPins(
  inventory: Map<string, string | null>,
  pins: Map<string, string>,
  corruptHint?: ReadonlySet<string>,
): InventoryDiff {
  const diffs: PackageDiff[] = [];
  const upToDate: string[] = [];
  const missing: string[] = [];
  const stale: string[] = [];
  const corrupt: string[] = [];

  for (const [pkg, installed] of inventory) {
    const expected = pins.get(pkg) ?? "";
    let status: PackageDiffStatus;

    if (installed === null) {
      // Missing OR corrupt. Use the hint if provided to disambiguate.
      status = corruptHint?.has(pkg) ? "corrupt" : "missing";
    } else if (!expected) {
      // No pin known for this whitelist entry — can't classify as stale.
      // Treat as current to avoid false-positive reinstall prompts when
      // pins file is absent (e.g. dev build). The pin-absent case is also
      // surfaced by `pins.size === 0` for callers that want to gate the
      // whole check on pin availability.
      status = "current";
    } else if (installed === expected) {
      status = "current";
    } else {
      status = "stale";
    }

    diffs.push({ pkg, installed, expected, status });

    switch (status) {
      case "current":
        upToDate.push(pkg);
        break;
      case "missing":
        missing.push(pkg);
        break;
      case "stale":
        stale.push(pkg);
        break;
      case "corrupt":
        corrupt.push(pkg);
        break;
    }
  }

  return {
    diffs,
    needsAction: missing.length > 0 || stale.length > 0 || corrupt.length > 0,
    upToDate,
    missing,
    stale,
    corrupt,
  };
}

/**
 * Disambiguate missing-vs-corrupt for every whitelist entry by independently
 * checking `existsSync` on the package.json path. Returns the set of
 * package names whose `package.json` exists on disk.
 */
export function detectExistingPackageJsons(managedDir: string): Set<string> {
  const present = new Set<string>();
  for (const pkg of ELECTRON_OWNED_PACKAGES) {
    const pkgJsonPath = path.join(
      managedDir,
      "node_modules",
      ...pkg.split("/"),
      "package.json",
    );
    if (existsSync(pkgJsonPath)) present.add(pkg);
  }
  return present;
}

/** Inputs for `runPreflight`. */
export interface RunPreflightOptions {
  managedDir: string;
  resourcesPath?: string;
  buildTimePinsPath?: string;
}

/**
 * Orchestrate inventory read + pin lookup + classification.
 *
 * - Reads installed versions from `<managedDir>/node_modules/<whitelist>/package.json`.
 * - Reads pinned versions from runtime manifest or build-time pins.
 * - Classifies each whitelist entry; disambiguates missing vs corrupt.
 *
 * When pins are unavailable (empty map), every entry is classified as
 * `current` to suppress false-positive reinstall prompts; callers needing
 * to detect the pins-absent state should check the returned diff's pin
 * coverage themselves (or call `readOfflinePackagePins` directly).
 */
export function runPreflight(opts: RunPreflightOptions): InventoryDiff {
  // Perf instrumentation — spec target: <100 ms warm, <500 ms cold.
  // Emits a single log line consumable by the manual smoke test (Group 14.4
  // of streamline-electron-bootstrap-and-recovery) without requiring any
  // wrapping by callers. Uses `process.hrtime.bigint()` for ns precision
  // and `console.log` so the line lands in `~/.pi/dashboard/server.log`
  // when invoked from Electron's main process via the splash status flow.
  const t0 = process.hrtime.bigint();
  const inventory = readManagedInventory(opts.managedDir);
  const tInventory = process.hrtime.bigint();
  const pins = readOfflinePackagePins(opts);
  const tPins = process.hrtime.bigint();

  // Build corrupt hint: entries where inventory is null BUT package.json exists.
  const existing = detectExistingPackageJsons(opts.managedDir);
  const corruptHint = new Set<string>();
  for (const [pkg, version] of inventory) {
    if (version === null && existing.has(pkg)) corruptHint.add(pkg);
  }

  const diff = compareWithPins(inventory, pins, corruptHint);
  const tDone = process.hrtime.bigint();
  const ms = (a: bigint, b: bigint): string => ((Number(b - a) / 1e6).toFixed(1));
  console.log(
    `[preflight] runPreflight done totalMs=${ms(t0, tDone)} inventoryMs=${ms(t0, tInventory)} pinsMs=${ms(tInventory, tPins)} classifyMs=${ms(tPins, tDone)} entries=${inventory.size} needsAction=${diff.needsAction}`,
  );
  return diff;
}

/**
 * Human-readable single-line diagnosis text for the loading-page diagnosis
 * row. Returns null when `needsAction` is false.
 */
export function formatDiagnosis(diff: InventoryDiff): string | null {
  if (!diff.needsAction) return null;
  const parts: string[] = [];
  if (diff.corrupt.length > 0) {
    parts.push(
      `Corrupt: ${diff.corrupt.join(", ")}. ~/.pi-dashboard/node_modules entries unreadable. Reinstall will repair.`,
    );
  }
  if (diff.missing.length > 0) {
    parts.push(
      `Missing: ${diff.missing.join(", ")}. Reinstall will fetch from the bundled offline cache.`,
    );
  }
  if (diff.stale.length > 0) {
    const stalePairs = diff.diffs
      .filter((d) => d.status === "stale")
      .map((d) => `${d.pkg} (have ${d.installed}, want ${d.expected})`)
      .join(", ");
    parts.push(`Outdated: ${stalePairs}. Reinstall will update.`);
  }
  return parts.join(" ");
}

// ── Cross-version probe (server-up case) ───────────────────────────────────

export type VersionSkew = "match" | "running-newer" | "running-older" | "unknown";

/**
 * Pure semver comparison of running server version vs Electron app version.
 *
 * Handles `vX.Y.Z` and `X.Y.Z` forms, with optional pre-release suffixes
 * (`-alpha.1`, `-rc.0`, etc.). Pre-release comparison is lexicographic on
 * the suffix string — sufficient for our use case (banner copy only, not
 * branch decisions). Returns `"unknown"` for unparseable inputs.
 */
export function compareRunningServerVersion(
  running: string | null | undefined,
  app: string | null | undefined,
): VersionSkew {
  if (!running || !app) return "unknown";
  const r = parseSemver(running);
  const a = parseSemver(app);
  if (!r || !a) return "unknown";

  if (r.major !== a.major) return r.major > a.major ? "running-newer" : "running-older";
  if (r.minor !== a.minor) return r.minor > a.minor ? "running-newer" : "running-older";
  if (r.patch !== a.patch) return r.patch > a.patch ? "running-newer" : "running-older";

  // Equal MAJOR.MINOR.PATCH — compare pre-release tags. A version with NO
  // pre-release ranks higher than one WITH a pre-release.
  if (r.pre === a.pre) return "match";
  if (!r.pre && a.pre) return "running-newer";
  if (r.pre && !a.pre) return "running-older";
  // Both have pre-release tags; lexicographic compare on the suffix.
  if (r.pre! > a.pre!) return "running-newer";
  if (r.pre! < a.pre!) return "running-older";
  return "match";
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  pre: string | null;
}

function parseSemver(input: string): ParsedSemver | null {
  const trimmed = input.trim().replace(/^v/i, "");
  const match = trimmed.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+](.+))?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ?? null,
  };
}
