/**
 * Model and thinking-level change detection.
 * Sends model_update only when values actually change.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BridgeContext } from "./bridge-context.js";
import { getCurrentModelString } from "./bridge-context.js";
import { gatherGitInfo, gatherGitStatus } from "./vcs-info.js";

/**
 * Send model_update if model or thinking level has changed since last send.
 */
export function sendModelUpdateIfChanged(bc: BridgeContext): void {
  const model = getCurrentModelString(bc);
  const thinkingLevel = (bc.pi as any).getThinkingLevel?.() ?? null;
  const thinkingLevelCache = thinkingLevel === null ? undefined : thinkingLevel;
  if (model === bc.lastModel && thinkingLevelCache === bc.lastThinkingLevel) return;
  bc.lastModel = model;
  bc.lastThinkingLevel = thinkingLevelCache;
  if (model) {
    bc.connection.send({
      type: "model_update",
      sessionId: bc.sessionId,
      model,
      thinkingLevel,
    });
  }
}

/**
 * Send session_name_update if name has changed since last send.
 */
export function sendSessionNameIfChanged(bc: BridgeContext): void {
  const name = bc.pi.getSessionName() ?? "";
  if (name === bc.lastSessionName) return;
  bc.lastSessionName = name;
  bc.connection.send({
    type: "session_name_update",
    sessionId: bc.sessionId,
    name,
  });
}

/**
 * Send git_info_update if branch, PR, or worktree state has changed since last send.
 */
export function sendGitInfoIfChanged(bc: BridgeContext, cwd: string): void {
  const info = gatherGitInfo(cwd);
  if (!info) return;
  // Worktree state diff: serialise to a stable string. `"null"` marks an
  // explicit "cwd is not a worktree" so a subsequent transition into a
  // worktree still counts as a change.
  const nextWorktreeJson = info.gitWorktree ? JSON.stringify(info.gitWorktree) : "null";
  // Working-tree dirtiness + drift, gathered on the same tick (one extra
  // `git status` — cheap; git is already running here). Serialised for a
  // stable change-diff; `"null"` = inconclusive probe this tick.
  // See change: add-session-uncommitted-indicator-and-commit.
  const status = gatherGitStatus(cwd);
  const nextStatusJson = status ? JSON.stringify(status) : "null";
  if (
    info.gitBranch === bc.lastGitBranch &&
    info.gitPrNumber === bc.lastGitPrNumber &&
    nextWorktreeJson === bc.lastGitWorktreeJson &&
    nextStatusJson === bc.lastGitStatusJson
  ) return;
  bc.lastGitBranch = info.gitBranch;
  bc.lastGitPrNumber = info.gitPrNumber;
  bc.lastGitWorktreeJson = nextWorktreeJson;
  bc.lastGitStatusJson = nextStatusJson;
  bc.connection.send({
    type: "git_info_update",
    sessionId: bc.sessionId,
    ...info,
    // `info` present ⇒ branch resolved ⇒ cwd is a confirmed git repo.
    // See change: gate-session-worktree-button-on-git.
    isGitRepo: true,
    // Use explicit `null` on the wire when worktree state went from
    // present → absent, so the server can clear its cached value.
    gitWorktree: info.gitWorktree ?? null,
    // Omit when the probe was inconclusive so the server keeps the last
    // known status rather than clearing it to a false all-clean.
    ...(status ? { gitStatus: status } : {}),
  });
}

/**
 * The last pi version is cached on BridgeContext so each bridge/session tracks
 * its own initial emission. The warning timestamp remains module-scoped because
 * it only rate-limits noisy diagnostics.
 */
/** Rate-limit failed-read warnings so Bun poll ticks don't flood the session log. */
let lastPiVersionWarnAt = 0;

const PI_PKG_CANDIDATES = [
  "@earendil-works/pi-coding-agent",
  "@mariozechner/pi-coding-agent",
] as const;
const PI_PKG = PI_PKG_CANDIDATES[0];

/**
 * Read a package's `version` without resolving its `./package.json` subpath.
 *
 * Node gates subpath resolution on the package's `exports` map: a package that
 * exports only `"."` makes resolving the `"<pkg>/package.json"` subpath throw
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` (pi 0.80.2 is such a package). So we resolve
 * the always-present `"."` entry instead, then walk up to the nearest
 * `package.json` whose `name` matches — the `name` check avoids grabbing an
 * ancestor workspace manifest under hoisted/linked layouts. Returns `undefined`
 * (not throw) when no matching manifest is found; a truly-uninstalled package
 * still throws from `resolveEntry`, which the caller catches.
 *
 * `resolveEntry`/`readFile`/`fileExists` are injectable for tests.
 */
export function readPkgVersionByWalkUp(
  pkgName: string,
  resolveEntry: (spec: string) => string,
  readFile: (p: string) => string = (p) => readFileSync(p, "utf8"),
  fileExists: (p: string) => boolean = existsSync,
): string | undefined {
  let dir = dirname(resolveEntry(pkgName));
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "package.json");
    if (fileExists(candidate)) {
      const parsed = JSON.parse(readFile(candidate)) as { name?: string; version?: string };
      if (parsed.name === pkgName) {
        return typeof parsed.version === "string" ? parsed.version : undefined;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Filesystem fallback for runtimes (Bun/jiti under OMP) where
 * `import.meta.resolve(pkg)` cannot see workspace/hoisted deps from an
 * externally-loaded extension path. Walks ancestors of `startDir` for
 * `node_modules/<pkg>/package.json`, then checks known managed installs.
 */
export function readPiVersionFromFilesystem(
  startDir: string,
  readFile: (p: string) => string = (p) => readFileSync(p, "utf8"),
  fileExists: (p: string) => boolean = existsSync,
  home: string = homedir(),
): string | undefined {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    for (const pkgName of PI_PKG_CANDIDATES) {
      const candidate = join(dir, "node_modules", pkgName, "package.json");
      if (!fileExists(candidate)) continue;
      try {
        const parsed = JSON.parse(readFile(candidate)) as { name?: string; version?: string };
        if (PI_PKG_CANDIDATES.includes(parsed.name as (typeof PI_PKG_CANDIDATES)[number]) && typeof parsed.version === "string") {
          return parsed.version;
        }
      } catch {
        // ignore malformed manifests
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  for (const root of [join(home, ".omp-dashboard"), join(home, ".omp", "plugins")]) {
    for (const pkgName of PI_PKG_CANDIDATES) {
      const candidate = join(root, "node_modules", pkgName, "package.json");
      if (!fileExists(candidate)) continue;
      try {
        const parsed = JSON.parse(readFile(candidate)) as { name?: string; version?: string };
        if (typeof parsed.version === "string") return parsed.version;
      } catch {
        // ignore
      }
    }
  }
  return undefined;
}

/**
 * Default reader: pi-coding-agent version from inside the bridge's own tree.
 *
 * Uses `import.meta.resolve` (the ESM resolver, `import` condition) rather than
 * `createRequire().resolve` (CJS, `require` condition): pi's `"."` export defines
 * only `import`/`types`, so the CJS resolver would itself throw
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` ("No exports main defined"). `import.meta.resolve`
 * returns a `file://` URL, converted to a path for the walk-up.
 */
function defaultReadPiVersion(): string | undefined {
  // 1) Node ESM resolver (works when the package is visible from this module).
  try {
    const version = readPkgVersionByWalkUp(PI_PKG, (spec) => fileURLToPath(import.meta.resolve(spec)));
    if (version) return version;
  } catch {
    // Bun/jiti often throws "Cannot find module … from <extension path>" here.
  }
  for (const alt of PI_PKG_CANDIDATES.slice(1)) {
    try {
      const version = readPkgVersionByWalkUp(alt, (spec) => fileURLToPath(import.meta.resolve(spec)));
      if (version) return version;
    } catch {
      // continue
    }
  }
  // 2) Direct filesystem probe — does not depend on package exports or Bun's
  // module graph for external --extension loads.
  return readPiVersionFromFilesystem(dirname(fileURLToPath(import.meta.url)));
}

/**
 * Send `pi_version_update` when the bridge's pi version differs from the last
 * sent value (including the first read). The bridge runs inside pi's own tree,
 * so `createRequire` resolution always succeeds. A read failure logs a warning
 * and skips the send; the next poll tick retries. `readVersion` is injectable
 * for tests.
 */
export function sendPiVersionIfChanged(
  bc: BridgeContext,
  readVersion: () => string | undefined = defaultReadPiVersion,
): void {
  let version: string | undefined;
  try {
    version = readVersion();
  } catch (e) {
    const now = Date.now();
    if (now - lastPiVersionWarnAt > 60_000) {
      lastPiVersionWarnAt = now;
      console.warn("[dashboard] pi version read failed:", e);
    }
    return;
  }
  if (!version || version === bc.lastPiVersion) return;
  bc.lastPiVersion = version;
  bc.connection.send({
    type: "pi_version_update",
    sessionId: bc.sessionId,
    version,
  });
}

/** Test-only: clear the failed-read warning rate-limit state. */
export function _resetPiVersionWarnRateLimit(): void {
  lastPiVersionWarnAt = 0;
}

/**
 * Reset the change-detection caches that aren't persisted on the server
 * side, so a server-restart-driven reconnect re-sends them. `gitBranch`
 * is already persisted to `.meta.json` so it's tolerable for a tick of
 * staleness.
 */
export function resetReconnectCaches(bc: BridgeContext): void {
  // Model updates are bridge-owned full snapshots; clear their dedup state so
  // reconnect publication cannot be suppressed by the prior socket lifetime.
  bc.lastModel = undefined;
  bc.lastThinkingLevel = undefined;
  // Defensive: reset git so a reconnect through a stale state cache
  // doesn't surface stale branch info if .meta.json wasn't persisted yet.
  bc.lastGitBranch = undefined;
  bc.lastGitPrNumber = undefined;
  bc.lastPiVersion = undefined;
  bc.lastGitWorktreeJson = undefined;
  bc.lastGitStatusJson = undefined;
}

/**
 * Emit `cwd_missing` the first time `existsSync(cwd)` flips to false.
 * Debounced via `bc.lastCwdMissing` — once we've reported missing, the
 * tick is a no-op forever (we never reset to false on rediscovery; see
 * the BridgeContext doc-comment for the rationale).
 *
 * Pure with respect to `bc` aside from caching the flag; the only side
 * effect is `connection.send`. See change: add-worktree-lifecycle-actions.
 */
export function sendCwdMissingIfChanged(
  bc: BridgeContext,
  cwd: string,
  exists: (p: string) => boolean = existsSync,
): void {
  if (bc.lastCwdMissing === true) return;
  if (!cwd) return;
  if (exists(cwd)) return;
  bc.lastCwdMissing = true;
  bc.connection.send({
    type: "cwd_missing",
    sessionId: bc.sessionId,
  });
}

