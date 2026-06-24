/**
 * Single pi resolution authority — shared by spawn, stats, and update.
 *
 * Resolves the pi the dashboard actually uses (same path the spawn path uses:
 * `ToolRegistry.resolveExecutor("pi")`), realpaths it, ascends to pi's module
 * root, and reads its version. Stats and the update path both consume this so
 * the version shown and the tree updated always match the spawned binary.
 *
 * See change: align-pi-update-with-resolved-pi.
 */
import { accessSync, constants, existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import {
  getDefaultRegistry,
  type ToolRegistry,
} from "@blackbelt-technology/pi-dashboard-shared/tool-registry/index.js";
import { getManagedDir } from "@blackbelt-technology/pi-dashboard-shared/managed-paths.js";

export interface WiredPi {
  /** Ready-to-spawn argv for the resolved pi (spawn argv[0], …argv.slice(1)). */
  argv: string[];
  /** Realpath'd resolved pi entry (cli.js / bin target). */
  path: string;
  /** Directory containing pi's package.json (its module root). */
  pkgRoot: string;
  /** Package name from pkgRoot/package.json, or null when unreadable. */
  name: string | null;
  /** Version from pkgRoot/package.json, or null when unreadable. */
  version: string | null;
}

export interface ResolveWiredPiSeams {
  _registry?: ToolRegistry;
  _realpath?: (p: string) => string;
  _existsSync?: (p: string) => boolean;
  _readFile?: (p: string) => string;
}

/** Max directories to ascend looking for pi's package.json. */
const MAX_ASCENT = 6;

/**
 * Resolve the pi wired to the dashboard. Returns null when pi does not resolve.
 */
export function resolveWiredPi(seams: ResolveWiredPiSeams = {}): WiredPi | null {
  const registry = seams._registry ?? getDefaultRegistry();
  const realpath = seams._realpath ?? realpathSync;
  const exists = seams._existsSync ?? existsSync;
  const readFile = seams._readFile ?? ((p: string) => readFileSync(p, "utf8"));

  const exec = registry.resolveExecutor("pi");
  if (!exec.ok || !exec.path || exec.argv.length === 0) return null;

  // Realpath the resolved entry so symlinked npm bin launchers
  // (e.g. /usr/local/bin/pi → …/pi-coding-agent/dist/cli.js) land on the
  // real module tree, not the bin-containing Node prefix.
  let entry: string;
  try {
    entry = realpath(exec.path);
  } catch {
    entry = exec.path;
  }

  // Ascend to the nearest package.json (pi's module root).
  let dir = path.dirname(entry);
  let pkgRoot: string | null = null;
  for (let i = 0; i < MAX_ASCENT; i++) {
    if (exists(path.join(dir, "package.json"))) {
      pkgRoot = dir;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (!pkgRoot) {
    // Fallback to the legacy dist/cli.js → ../.. heuristic; metadata unknown.
    return {
      argv: exec.argv,
      path: entry,
      pkgRoot: path.dirname(path.dirname(entry)),
      name: null,
      version: null,
    };
  }

  let version: string | null = null;
  let name: string | null = null;
  try {
    const parsed = JSON.parse(readFile(path.join(pkgRoot, "package.json"))) as {
      name?: string;
      version?: string;
    };
    if (typeof parsed.version === "string") version = parsed.version;
    if (typeof parsed.name === "string") name = parsed.name;
  } catch {
    /* leave metadata null */
  }

  return { argv: exec.argv, path: entry, pkgRoot, name, version };
}

/** Concrete package manager used for an in-place install. */
export type PiPackageManager = "npm" | "pnpm" | "yarn" | "bun";

/** Full install classification (mirrors pi's detectInstallMethod + qwen-code). */
export type PiInstallMethod =
  | "npm"
  | "pnpm"
  | "yarn"
  | "bun"
  | "npx"
  | "homebrew"
  | "source"
  | "workspace"
  | "unknown";

export interface PiInstallInfo {
  /** Classified install method (by realpath markers). */
  method: PiInstallMethod;
  /** Scope of the install. `none` for transient/source/unknown. */
  scope: "global" | "local" | "none";
  /** Directory to run an in-place install in (owner of the node_modules). */
  installPrefix: string;
  /** Concrete package manager for the in-place install command. */
  packageManager: PiPackageManager;
  /** Whether pkgRoot (and its parent) are writable. */
  writable: boolean;
  /** Whether the dashboard can update this install (in place or via pi-self). */
  updatable: boolean;
  /** Instruction shown when `updatable === false`. */
  manualAction?: string;
}

export interface ClassifyPiInstallSeams {
  _existsSync?: (p: string) => boolean;
  _accessSync?: (p: string, mode: number) => void;
  _readFile?: (p: string) => string;
}

/**
 * Classify the resolved pi install for in-place updating by the dashboard:
 * which prefix owns it, which package manager governs that prefix, and whether
 * the path is writable. Used for the fallback when pi's own `pi update --self`
 * declines a non-global install. See change: align-pi-update-with-resolved-pi.
 */
export function classifyPiInstall(
  wired: WiredPi,
  seams: ClassifyPiInstallSeams = {},
): PiInstallInfo {
  const exists = seams._existsSync ?? existsSync;
  const access = seams._accessSync ?? accessSync;
  const readFile = seams._readFile ?? ((p: string) => readFileSync(p, "utf8"));
  const sep = path.sep;

  // installPrefix = the directory that OWNS the node_modules containing pi.
  const marker = `${sep}node_modules${sep}`;
  const idx = wired.pkgRoot.lastIndexOf(marker);
  const installPrefix = idx >= 0 ? wired.pkgRoot.slice(0, idx) : path.dirname(wired.pkgRoot);

  // Writable check mirrors pi's own isSelfUpdatePathWritable(): pkgRoot + parent.
  let writable = true;
  try {
    access(wired.pkgRoot, constants.W_OK);
    access(path.dirname(wired.pkgRoot), constants.W_OK);
  } catch {
    writable = false;
  }

  // detectPm: walk up from the install prefix (workspace-aware). Priority:
  //   1. package.json `packageManager` field (corepack standard — definitive)
  //   2. npm when package-lock.json/npm-shrinkwrap.json present (npm built the
  //      resolved node_modules; wins ties when multiple lockfiles coexist)
  //   3. sole pnpm / yarn / bun lockfile
  // Default npm. Mirrors antfu package-manager-detector ordering.
  const pmFromField = (dir: string): PiPackageManager | null => {
    const pj = path.join(dir, "package.json");
    if (!exists(pj)) return null;
    try {
      const field = (JSON.parse(readFile(pj)) as { packageManager?: string }).packageManager;
      if (typeof field === "string") {
        const nm = field.split("@")[0];
        if (nm === "pnpm" || nm === "yarn" || nm === "bun" || nm === "npm") return nm;
      }
    } catch {
      /* ignore unreadable package.json */
    }
    return null;
  };
  const detectPm = (): PiPackageManager => {
    let dir = installPrefix;
    for (let i = 0; i < 6; i++) {
      const field = pmFromField(dir);
      if (field) return field;
      if (exists(path.join(dir, "package-lock.json")) || exists(path.join(dir, "npm-shrinkwrap.json"))) return "npm";
      if (exists(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
      if (exists(path.join(dir, "yarn.lock"))) return "yarn";
      if (exists(path.join(dir, "bun.lockb"))) return "bun";
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return "npm";
  };

  const refuse = (method: PiInstallMethod, manualAction: string): PiInstallInfo => ({
    method, scope: "none", installPrefix, packageManager: "npm", writable, updatable: false, manualAction,
  });
  const roMsg = `This pi install is read-only (${wired.pkgRoot}). Update the application or package manager that provides it.`;

  // Classify by realpath markers (mirrors pi.detectInstallMethod + qwen-code).
  const rp = (wired.path || wired.pkgRoot).replace(/\\/g, "/");

  // Transient runners — not an installed copy.
  if (/\/(_npx|_pnpx)\//.test(rp) || /\/\.bun\/install\/cache\//.test(rp)) {
    return refuse("npx", "Running via npx/bunx — update is not applicable; re-invoke with the version you want.");
  }
  // Homebrew / OS package.
  if (/\/(Cellar|homebrew)\//.test(rp) || /\/opt\/homebrew\//.test(rp)) {
    return refuse("homebrew", "Installed via Homebrew — run: brew upgrade");
  }
  // Global package-manager stores (pi's own `pi update --self` handles these).
  if (/\/\.pnpm\/global\//.test(rp) || /\/pnpm\/global\//.test(rp)) {
    return { method: "pnpm", scope: "global", installPrefix, packageManager: "pnpm", writable, updatable: writable, ...(writable ? {} : { manualAction: roMsg }) };
  }
  if (/\/\.yarn\/global\//.test(rp)) {
    return { method: "yarn", scope: "global", installPrefix, packageManager: "yarn", writable, updatable: writable, ...(writable ? {} : { manualAction: roMsg }) };
  }
  if (/\/\.bun\/(bin|install\/global)\//.test(rp)) {
    return { method: "bun", scope: "global", installPrefix, packageManager: "bun", writable, updatable: writable, ...(writable ? {} : { manualAction: roMsg }) };
  }

  // managed-dir detection (via getManagedDir) + workspace-root detection.
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const managedDir = norm(getManagedDir());
  const isManaged = (p: string) => norm(p) === managedDir;
  const findWorkspaceRoot = (start: string): string | null => {
    let dir = start;
    for (let i = 0; i < 6; i++) {
      const pj = path.join(dir, "package.json");
      if (exists(pj)) {
        try {
          if ((JSON.parse(readFile(pj)) as { workspaces?: unknown }).workspaces) return dir;
        } catch {
          /* ignore */
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  };

  // Inside a node_modules tree → local install, OR unix npm-global (`…/lib/node_modules`).
  if (idx >= 0) {
    const normPrefix = installPrefix.replace(/\\/g, "/");
    const isNpmGlobal = /(^|\/)lib$/.test(normPrefix); // unix global: <prefix>/lib/node_modules
    if (isNpmGlobal) {
      return { method: "npm", scope: "global", installPrefix, packageManager: "npm", writable, updatable: writable, ...(writable ? {} : { manualAction: roMsg }) };
    }
    const pm = detectPm();
    // Workspace/monorepo checkout: NOT auto-updated. A plain in-place install
    // cannot reliably bump a workspace-pinned dependency — npm errors
    // (ERESOLVE), crashes (--legacy-peer-deps `reading 'spec'`), or no-ops
    // (--force keeps the locked version), AND `^0.x` ranges are minor-locked.
    // The reliable update is to relax the binding version ranges + reinstall;
    // surface that as an instruction (the one-click "auto-bump pins + install"
    // flow is the documented future design). See change:
    // align-pi-update-with-resolved-pi.
    if (!isManaged(installPrefix)) {
      const wsRoot = findWorkspaceRoot(installPrefix);
      if (wsRoot) {
        return {
          method: "workspace",
          scope: "local",
          installPrefix: wsRoot,
          packageManager: pm,
          writable,
          updatable: false,
          manualAction: `pi is a workspace dependency of ${wsRoot}. Bump the binding "@earendil-works/pi-coding-agent" ranges (root peerDependencies + packages/server dependencies) and run npm install, then restart.`,
        };
      }
    }
    return {
      method: pm,
      scope: "local",
      installPrefix,
      packageManager: pm,
      writable,
      updatable: writable,
      ...(writable ? {} : { manualAction: roMsg }),
    };
  }

  // Not in node_modules → source/git checkout, else unknown.
  if (exists(path.join(wired.pkgRoot, ".git")) || exists(path.join(path.dirname(wired.pkgRoot), ".git"))) {
    return refuse("source", "Running from a source checkout — update with: git pull (then rebuild).");
  }
  return refuse("unknown", `Unknown pi install at ${wired.pkgRoot} — update via the package manager or installer that provides it.`);
}

/** Update scope passed to the resolved pi's own `pi update` subcommand. */
export type PiUpdateMode =
  | { kind: "self" }
  | { kind: "all" }
  | { kind: "extensions" }
  | { kind: "extension"; source: string };

/**
 * Build the spawn argv for delegating to the resolved pi's own updater:
 * `<wired.argv> update <flag…>`. Spawn via argv[0], argv.slice(1).
 */
export function buildPiUpdateArgv(wired: WiredPi, mode: PiUpdateMode): string[] {
  const tail =
    mode.kind === "self"
      ? ["update", "--self"]
      : mode.kind === "all"
        ? ["update", "--all"]
        : mode.kind === "extensions"
          ? ["update", "--extensions"]
          : ["update", "--extension", mode.source];
  return [...wired.argv, ...tail];
}

/**
 * Heuristic: does pi's output indicate it refused to self-update this install
 * (source checkout / electron / unsupported package manager)? pi prints a
 * `getSelfUpdateUnavailableInstruction()` line in that case.
 */
export function isSelfUpdateUnavailable(output: string): boolean {
  return /cannot self-update this installation|self-update .* only supported|update .* manually|update pi manually/i.test(
    output,
  );
}
