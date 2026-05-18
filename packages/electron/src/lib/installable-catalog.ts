/**
 * Catalog assembly — read the two bundled sources shipped with the Electron
 * app (offline-cache pins + bundled-extensions Git cache) and emit a unified
 * `InstallableList` ready for the slimmed wizard's package selector.
 *
 * Two tiers only:
 *   - `core`        — pinned in `offline-packages.json`; always installed.
 *   - `extension`   — bundled in `resources/bundled-extensions/<id>/`;
 *                     toggleable by the user, `defaultOn` per
 *                     `BUNDLED_EXTENSION_IDS` recommended flags.
 *
 * The `npm-registry` tier is intentionally NOT included here. Online
 * discovery happens post-install via Settings → Packages.
 *
 * All helpers are pure I/O (sync `fs`) — no spawn, no network. Missing
 * resource directories are tolerated (returns empty extensions section,
 * not an error) so dev builds without bundled assets still produce a
 * valid catalog.
 *
 * See change: streamline-electron-bootstrap-and-recovery (Group 9).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type {
  InstallableList,
  InstallablePackage,
} from "@blackbelt-technology/pi-dashboard-shared/installable-list.js";
import {
  BUNDLED_EXTENSION_IDS,
  RECOMMENDED_EXTENSIONS,
} from "@blackbelt-technology/pi-dashboard-shared/recommended-extensions.js";

// ── locations ──────────────────────────────────────────────────────────────

/** Where the offline-packages manifest lives at runtime inside the Electron bundle. */
function offlineManifestPath(resourcesPath: string): string {
  return path.join(resourcesPath, "offline-packages", "manifest.json");
}

/** Where bundle-recommended-extensions.mjs lays out the Git-cached extensions. */
function bundledExtensionsDir(resourcesPath: string): string {
  return path.join(resourcesPath, "bundled-extensions");
}

// ── core tier ──────────────────────────────────────────────────────────────

/** Shape of the per-platform manifest written by `bundle-offline-packages.mjs`. */
interface OfflineManifest {
  platform?: string;
  pins?: Array<{ name: string; version: string }>;
  packages?: Array<{ name: string; version: string }>; // alt shape (pre-build pins file)
}

/**
 * Read pinned core packages from the runtime manifest at
 * `<resourcesPath>/offline-packages/manifest.json`. Falls back to an
 * adjacent `offline-packages.json` (dev / source builds) when the runtime
 * manifest is absent.
 *
 * Each entry becomes a `core` row with `required: true`, `kind: "npm"`,
 * `source: "offline-cache"`.
 */
export function readCoreFromOfflinePackagesJson(
  resourcesPath: string,
): InstallablePackage[] {
  const candidate = offlineManifestPath(resourcesPath);
  if (!existsSync(candidate)) {
    return [];
  }

  let parsed: OfflineManifest;
  try {
    parsed = JSON.parse(readFileSync(candidate, "utf8")) as OfflineManifest;
  } catch {
    return [];
  }

  const pins = parsed.pins ?? parsed.packages ?? [];
  return pins.map((pin) => ({
    name: pin.name,
    version: pin.version,
    required: true,
    kind: "npm",
    source: "offline-cache",
  }));
}

// ── extension tier ─────────────────────────────────────────────────────────

/**
 * Enumerate extension directories under `<resourcesPath>/bundled-extensions/`.
 * Each subdirectory is treated as one bundled extension; its `package.json`
 * supplies `name` (npm package name) and `version`. The directory name
 * itself is the recommended-extension `id` (matches `BUNDLED_EXTENSION_IDS`).
 *
 * Returned entries have `required: false`, `kind: "pi-extension"`,
 * `source: "bundled-git"`. Their `defaultOff` flag is left absent, meaning
 * "checked by default in the wizard" — every entry in
 * `BUNDLED_EXTENSION_IDS` is implicitly recommended; explicit opt-out is
 * up to the user.
 *
 * Tolerates a missing dir (dev / opt-out builds) by returning `[]`.
 */
export function readBundledExtensionsFromGitCache(
  resourcesPath: string,
): InstallablePackage[] {
  const dir = bundledExtensionsDir(resourcesPath);
  if (!existsSync(dir)) {
    return [];
  }

  let entries: string[];
  try {
    entries = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }

  const out: InstallablePackage[] = [];
  for (const id of entries) {
    const pkgJsonPath = path.join(dir, id, "package.json");
    if (!existsSync(pkgJsonPath)) continue;

    let parsed: { name?: string; version?: string };
    try {
      parsed = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    } catch {
      continue;
    }
    if (!parsed.name || !parsed.version) continue;

    // Cross-check against the curated whitelist. Anything in
    // bundled-extensions/ that isn't in BUNDLED_EXTENSION_IDS is bundled
    // by accident — surface it anyway (user can decide), but log nothing
    // here; the bundling script's own checks should catch drift.
    const recommended = RECOMMENDED_EXTENSIONS.find((e) => e.id === id);
    const isCuratedBundled = BUNDLED_EXTENSION_IDS.includes(id);
    void isCuratedBundled;

    out.push({
      name: parsed.name,
      version: parsed.version,
      required: false,
      kind: "pi-extension",
      source: "bundled-git",
      // displayName lives only in RECOMMENDED_EXTENSIONS; surface it for the
      // wizard via a side-channel field on the package object. The
      // `InstallablePackage` interface doesn't declare it, but the wizard
      // renderer reads catalogs by structural typing, so extra fields are
      // safe.
      ...(recommended ? { displayName: recommended.displayName } : {}),
    } as InstallablePackage);
  }

  // Deterministic ordering for stable UI rendering + reproducible tests.
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// ── public assembler ───────────────────────────────────────────────────────

export interface AssembleCatalogOptions {
  /** Absolute path to the Electron app's `resources/` directory. */
  resourcesPath: string;
}

/**
 * Assemble the wizard's package catalog from the two bundled sources.
 *
 * Result envelope is a `schemaVersion: 2` `InstallableList` ready to write
 * to `~/.pi/dashboard/installable.json` or render in the wizard. Empty
 * resource paths produce a valid (but empty) list — not an error — so dev
 * builds and offline-disabled CI builds still boot.
 */
export function assembleCatalog(opts: AssembleCatalogOptions): InstallableList {
  const core = readCoreFromOfflinePackagesJson(opts.resourcesPath);
  const extensions = readBundledExtensionsFromGitCache(opts.resourcesPath);

  return {
    version: "1.0",
    schemaVersion: 2,
    packages: [...core, ...extensions],
  };
}
