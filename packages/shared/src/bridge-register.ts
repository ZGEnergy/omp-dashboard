/**
 * Shared bridge extension registration for pi's settings.json.
 * Used by both the server and Electron app to register the dashboard
 * bridge extension so pi sessions can discover and load it.
 *
 * Single source of truth — replaces the near-identical implementations
 * in packages/server/src/extension-register.ts and
 * packages/electron/src/lib/bridge-register.ts.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

/**
 * Check that a candidate path is a valid, stable extension directory.
 * Returns true when the directory exists, contains a package.json, and
 * is NOT under /tmp/.mount_* (unstable AppImage mount).
 */
function isValidExtensionPath(candidate: string): boolean {
  if (!fs.existsSync(candidate)) return false;
  if (!fs.existsSync(path.join(candidate, "package.json"))) return false;
  if (candidate.includes("/tmp/.mount_")) {
    console.warn(
      "[dashboard] AppImage detected — extension path is temporary, skipping registration:",
      candidate,
    );
    return false;
  }
  return true;
}

/**
 * Optional dependency injection for `findBundledExtension`. Tests pass
 * `{ resolvePackage: () => null }` to disable the node-resolver fallback.
 */
export interface FindExtensionDeps {
  /**
   * Resolve `@blackbelt-technology/pi-dashboard-extension/package.json`
   * via Node's module resolver. Return the absolute package.json path
   * or null. Defaults to `createRequire(import.meta.url).resolve(...)`.
   */
  resolvePackage?: () => string | null;
}

/**
 * Find the nearest package root for a candidate extension path.
 * Accepts either a package directory or an entry file inside it.
 */
function findPackageDir(candidate: string): string | null {
  let current = candidate;
  try {
    const stat = fs.statSync(candidate);
    if (stat.isFile()) current = path.dirname(candidate);
  } catch {
    current = path.dirname(candidate);
  }
  for (let i = 0; i < 4; i++) {
    const pkgPath = path.join(current, "package.json");
    if (fs.existsSync(pkgPath)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/**
 * Read `name` from the nearest package.json above `candidate`.
 * Returns null on any error or when no package root exists.
 * Used for identity-based dedup in `registerBridgeExtension`.
 * Accepts both file paths and directory paths.
 */
function readPackageName(candidate: string): string | null {
  try {
    const packageDir = findPackageDir(candidate);
    if (!packageDir) return null;
    const pkgPath = path.join(packageDir, "package.json");
    const raw = fs.readFileSync(pkgPath, "utf-8");
    const parsed = JSON.parse(raw);
    return typeof parsed?.name === "string" ? parsed.name : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the root export path from a package.json `exports` field.
 * Handles string exports, object `.` keys, and conditional exports.
 */
function extractRootExport(exportsField: unknown): string | null {
  if (typeof exportsField === "string") return exportsField;
  if (!exportsField || typeof exportsField !== "object") return null;
  const root = (exportsField as Record<string, unknown>)["."];
  if (typeof root === "string") return root;
  if (!root || typeof root !== "object") return null;
  const conditional = root as Record<string, unknown>;
  for (const key of ["import", "default", "node"]) {
    const value = conditional[key];
    if (typeof value === "string") return value;
  }
  return null;
}

/**
 * Resolve a package directory to the concrete extension entry OMP should load.
 * Tries omp.extensions[0], then pi.extensions[0], then exports["."], then main,
 * then index.js/index.ts. Returns the original path when it's already a file or
 * when no candidate resolves to an existing file.
 */
function resolveRegisteredExtensionPath(extensionPath: string): string {
  try {
    const stat = fs.statSync(extensionPath);
    if (stat.isFile()) return extensionPath;
    if (!stat.isDirectory()) return extensionPath;
  } catch {
    return extensionPath;
  }

  const packageDir = findPackageDir(extensionPath);
  if (!packageDir) return extensionPath;

  try {
    const pkgPath = path.join(packageDir, "package.json");
    const raw = fs.readFileSync(pkgPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      main?: unknown;
      exports?: unknown;
      omp?: { extensions?: unknown };
      pi?: { extensions?: unknown };
    };
    const candidates: Array<string | null> = [
      Array.isArray(parsed.omp?.extensions) && typeof parsed.omp.extensions[0] === "string"
        ? parsed.omp.extensions[0]
        : null,
      Array.isArray(parsed.pi?.extensions) && typeof parsed.pi.extensions[0] === "string"
        ? parsed.pi.extensions[0]
        : null,
      extractRootExport(parsed.exports),
      typeof parsed.main === "string" ? parsed.main : null,
      "index.js",
      "index.ts",
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const resolved = path.resolve(packageDir, candidate);
      try {
        if (fs.statSync(resolved).isFile()) return resolved;
      } catch {
        // try next candidate
      }
    }
  } catch {
    // fall through to original path
  }

  return extensionPath;
}

function defaultResolvePackage(): string | null {
  try {
    const req = createRequire(import.meta.url);
    return req.resolve("@blackbelt-technology/pi-dashboard-extension/package.json");
  } catch {
    return null;
  }
}

/**
 * Find the bundled extension directory.
 *
 * Resolution order:
 *   1. Monorepo layout: `<baseDir>/packages/extension/`.
 *   2. Node module resolution: `@blackbelt-technology/pi-dashboard-extension/package.json`
 *      via `require.resolve` from this module. Works in ANY install layout
 *      (flat `node_modules/`, scoped, nested, pnpm, npm-g). This is the
 *      canonical identity-based lookup and the only reliable strategy
 *      when pi-dashboard is installed via `npm i -g`.
 *
 * Returns null if both strategies fail, the resolved directory doesn't
 * have a package.json, or the path is under /tmp/.mount_* (AppImage).
 *
 * See change: unified-bootstrap-install.
 */
export function findBundledExtension(
  baseDir: string,
  deps: FindExtensionDeps = {},
): string | null {
  // Strategy 1: monorepo sibling layout.
  const monorepoCandidate = path.resolve(baseDir, "packages", "extension");
  if (isValidExtensionPath(monorepoCandidate)) return monorepoCandidate;

  // Strategy 2: Node module resolver. This works for the `npm i -g
  // pi-dashboard` layout where the extension is shipped as a runtime dep
  // of pi-dashboard-server.
  const resolver = deps.resolvePackage ?? defaultResolvePackage;
  const extPkgJson = resolver();
  if (extPkgJson) {
    const extDir = path.dirname(extPkgJson);
    if (isValidExtensionPath(extDir)) return extDir;
  }

  return null;
}

/** Optional overrides for testing / multi-HOME scenarios. */
export interface BridgeRegisterOptions {
  /**
   * Override the HOME used to locate settings.json. When omitted,
   * falls back to `$HOME || $USERPROFILE || os.homedir()` (existing behavior).
   */
  homedir?: string;
}

/**
 * Register an extension path in pi's settings.json packages array.
 *
 * Package directories are resolved to their declared entry file
 * (omp.extensions[0] → pi.extensions[0] → exports["."] → main → index)
 * before writing, so the settings loader picks the right file.
 *
 * Non-destructive cleanup: only removes dashboard-related paths
 * that point to non-existent directories or directories without package.json.
 * Existing valid registrations (dev, global, other bundled) are preserved.
 *
 * No-op if the path is already registered.
 */
export function registerBridgeExtension(
  extensionPath: string,
  opts: BridgeRegisterOptions = {},
): void {
  // Compute at call time so tests can override HOME
  const home = opts.homedir
    ?? process.env.HOME
    ?? process.env.USERPROFILE
    ?? os.homedir();
  const settingsPath = path.join(home, ".omp", "agent", "settings.json");
  const settingsDir = path.dirname(settingsPath);
  fs.mkdirSync(settingsDir, { recursive: true });

  let settings: Record<string, unknown> = {};
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, "utf-8").trim();
      if (raw) settings = JSON.parse(raw);
    }
  } catch { /* start fresh */ }

  const packages = Array.isArray(settings.packages) ? settings.packages as string[] : [];

  // Resolve package directories to their declared entry file so OMP's
  // settings loader picks the right file instead of scanning for .ts.
  const registeredPath = resolveRegisteredExtensionPath(extensionPath);

  // Already registered?
  if (packages.includes(registeredPath)) return;

  // Compute the identity (package.json#name) of the new entry. We use it
  // to dedupe across install layouts (dev / .app / npm-global / legacy
  // managed dir) that all register the same extension under different
  // absolute paths.
  const newIdentity = readPackageName(registeredPath);

  // Non-destructive cleanup: drop stale dashboard paths AND drop any
  // local entry with the same package.json#name as the new one
  // (most-recently-asserted path wins). npm:-scheme entries pass through
  // untouched.
  const cleaned = packages.filter((p) => {
    if (typeof p !== "string") return true;
    const isLocalPath = p.startsWith("/") || /^[a-zA-Z]:[/\\]/.test(p);
    if (!isLocalPath) return true;

    // Identity dedup: same package name as the incoming entry?
    if (newIdentity) {
      const existingIdentity = readPackageName(p);
      if (existingIdentity && existingIdentity === newIdentity) return false;
    }

    // Only consider dashboard-related paths for path-based cleanup
    // Normalize: lowercase + collapse spaces/hyphens so "PI Dashboard" matches "pi-dashboard"
    const normalized = p.toLowerCase().replace(/[\s_-]/g, "");
    if (!normalized.includes("pidashboard") && !normalized.includes("piagentdashboard")) return true;
    // Keep paths that point to existing directories with a package.json
    try {
      return fs.existsSync(p) && fs.existsSync(path.join(p, "package.json"));
    } catch {
      return false; // Can't check — treat as stale
    }
  });

  cleaned.push(registeredPath);
  settings.packages = cleaned;

  try {
    const tmp = settingsPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + "\n");
    fs.renameSync(tmp, settingsPath);
    console.log(`[dashboard] Registered bridge extension: ${registeredPath}`);
  } catch (err) {
    console.error("[dashboard] Failed to register bridge extension:", err);
  }
}
