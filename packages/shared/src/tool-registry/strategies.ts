/**
 * Reusable resolution strategies shared across tool definitions.
 *
 * Strategies are pure functions over their `StrategyCtx` — filesystem
 * access (`existsSync`) is the only side effect. They never spawn; PATH
 * search delegates to `ToolResolver.which()` which is injectable for
 * tests via the `lookup` parameter.
 *
 * See change: consolidate-tool-resolution (design §2).
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ToolResolver, isAppImageSelfHit } from "../platform/binary-lookup.js";
import { getManagedBin, getManagedDir } from "../managed-paths.js";
import { getManagedNodeBinDir } from "../platform/managed-node-path.js";
import * as npm from "../platform/npm.js";
import type { Strategy, StrategyCtx, StrategyResult } from "./types.js";

/**
 * Injectable surfaces used by strategies.
 *
 * - `exists` — fs existence probe (memfs in tests).
 * - `which` — PATH search.
 * - `npmRootGlobal` — result of `npm root -g` (tests inject to avoid spawn).
 * - `resolveModule` — node-module resolution (id, from) → absolute path.
 *   Production uses `createRequire(from).resolve(id)`; tests walk fake
 *   node_modules trees.
 * - `resourcesPath` — `process.resourcesPath` (Electron-only). Production
 *   reads the live global at call time; tests inject a fixed value.
 *   Returns `null` outside Electron so `electronBundledRuntimeStrategy`
 *   yields cleanly without filesystem probes.
 *   See change: fix-electron-wizard-npm-root-enoent.
 */
export interface StrategyDeps {
  exists?(p: string): boolean;
  which?(name: string): string | null;
  npmRootGlobal?(): string;
  resolveModule?(id: string, from: string): string | null;
  resourcesPath?(): string | null;
}

function defaultResolveModule(id: string, from: string): string | null {
  try {
    return createRequire(from).resolve(id);
  } catch {
    return null;
  }
}

function defaults(): Required<StrategyDeps> {
  const resolver = new ToolResolver({
    processExecPath: process.execPath,
    useLoginShell: true,
  });
  return {
    exists: existsSync,
    which: (name) => resolver.which(name),
    npmRootGlobal: () => npm.rootGlobalOr(""),
    resolveModule: defaultResolveModule,
    resourcesPath: () =>
      (process as unknown as { resourcesPath?: string }).resourcesPath ?? null,
  };
}

/** Merge caller-supplied deps over the live defaults. */
function d(deps?: StrategyDeps): Required<StrategyDeps> {
  const base = defaults();
  if (!deps) return base;
  return {
    exists: deps.exists ?? base.exists,
    which: deps.which ?? base.which,
    npmRootGlobal: deps.npmRootGlobal ?? base.npmRootGlobal,
    resolveModule: deps.resolveModule ?? base.resolveModule,
    resourcesPath: deps.resourcesPath ?? base.resourcesPath,
  };
}

// ── Strategies ──────────────────────────────────────────────────────────────

/**
 * Look up a registered path override by tool name. Existence is checked
 * here so invalid overrides fall through with reason `invalid: <...>`
 * without requiring callers to wire a separate validator.
 */
export function overrideStrategy(toolName: string, deps?: StrategyDeps): Strategy {
  const { exists } = d(deps);
  return {
    name: "override",
    run(ctx): StrategyResult {
      const p = ctx.overrides[toolName];
      if (!p) return { ok: false, reason: "no override set" };
      if (!exists(p)) return { ok: false, reason: `invalid: path does not exist: ${p}` };
      return { ok: true, path: p };
    },
  };
}

/**
 * Managed Node runtime: `<managedDir>/node/{node.exe,npm.cmd,npx.cmd}`
 * on Windows or `<managedDir>/node/bin/{node,npm,npx}` on Unix.
 *
 * Lets `ToolRegistry.resolve("node")` and `resolve("npm")` prefer the
 * persistent runtime under `~/.pi-dashboard/node/` (installed by
 * `installManagedNode`) over the system PATH lookup, while still
 * deferring to `tool-overrides.json`.
 *
 * Returns `null` when the managed Node runtime is not present, so the
 * standalone-CLI / no-Electron-resources case falls through cleanly to
 * the existing `where`/PATH strategy.
 *
 * See change: embed-managed-node-runtime (spec: managed-node-runtime,
 * Requirement: ToolRegistry resolves managed runtime first).
 */
export function managedRuntimeStrategy(
  toolName: "node" | "npm" | "npx",
  deps?: StrategyDeps,
): Strategy {
  const { exists } = d(deps);
  return {
    name: "managed",
    run(ctx): StrategyResult {
      const dir = getManagedNodeBinDir(ctx.env, ctx.platform);
      const isWin = ctx.platform === "win32";
      const fileName =
        toolName === "node"
          ? isWin
            ? "node.exe"
            : "node"
          : isWin
            ? `${toolName}.cmd`
            : toolName;
      const candidate = path.join(dir, fileName);
      if (exists(candidate)) return { ok: true, path: candidate };
      return { ok: false, reason: `missing: ${candidate}` };
    },
  };
}

/**
 * Electron-bundled Node runtime: `<process.resourcesPath>/node/...`.
 *
 * Layout mirrors `getBundledNpmPath()` / `getBundledNodePath()` in
 * `packages/electron/src/lib/bundled-node.ts` exactly:
 *
 *   Unix:    <resourcesPath>/node/bin/node
 *            <resourcesPath>/node/lib/node_modules/npm/bin/npm-cli.js
 *   Windows: <resourcesPath>/node/node.exe
 *            <resourcesPath>/node/node_modules/npm/bin/npm-cli.js
 *
 * Fires when `process.resourcesPath` is set (i.e. inside Electron) AND
 * the wizard's `installManagedNode()` has not yet populated
 * `~/.pi-dashboard/node/`. Reports `ok:false` cleanly outside Electron
 * so non-Electron consumers (CLI, extension, dev server, tests) skip
 * it without side effects.
 *
 * Strategy name is `"electron-bundled"` in the diagnostic trail so it
 * is distinguishable from the persistent `managed-runtime` strategy,
 * but `classify()` SHOULD still map it to `Source.managed` because
 * semantically the user did not install this runtime.
 *
 * See change: fix-electron-wizard-npm-root-enoent.
 */
export function electronBundledRuntimeStrategy(
  toolName: "node" | "npm",
  deps?: StrategyDeps,
): Strategy {
  const { exists, resourcesPath } = d(deps);
  return {
    name: "electron-bundled",
    run(ctx): StrategyResult {
      const root = resourcesPath();
      if (!root) {
        return {
          ok: false,
          reason: "not running in Electron (no resourcesPath)",
        };
      }
      const isWin = ctx.platform === "win32";
      const candidates: string[] = [];
      if (toolName === "node") {
        candidates.push(
          isWin
            ? path.join(root, "node", "node.exe")
            : path.join(root, "node", "bin", "node"),
        );
      } else {
        // toolName === "npm": resolve directly to npm-cli.js so
        // nodeScriptToArgv wraps it as `[node, npm-cli.js]`, bypassing
        // any shell shim. Unix and Windows differ only in whether the
        // npm package lives under `lib/node_modules` or `node_modules`.
        candidates.push(
          isWin
            ? path.join(root, "node", "node_modules", "npm", "bin", "npm-cli.js")
            : path.join(root, "node", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
        );
      }
      for (const candidate of candidates) {
        if (exists(candidate)) return { ok: true, path: candidate };
      }
      return { ok: false, reason: `missing: ${candidates[0]}` };
    },
  };
}

/**
 * Managed install: `~/.pi-dashboard/node_modules/.bin/<name>(.cmd)` for
 * binaries, or any explicit relative path under `MANAGED_DIR` for
 * modules/directories.
 */
export function managedBinStrategy(
  binaryName: string,
  deps?: StrategyDeps,
): Strategy {
  const { exists } = d(deps);
  return {
    name: "managed",
    run(ctx): StrategyResult {
      const ext = ctx.platform === "win32" ? ".cmd" : "";
      const candidate = path.join(getManagedBin(ctx.env), binaryName + ext);
      if (exists(candidate)) return { ok: true, path: candidate };
      return { ok: false, reason: `missing: ${candidate}` };
    },
  };
}

/**
 * Managed module entry: `~/.pi-dashboard/node_modules/<pkg>/dist/index.js`
 * (or a caller-specified relative entry).
 */
export function managedModuleStrategy(
  pkgName: string,
  entryRelative: string = path.join("dist", "index.js"),
  deps?: StrategyDeps,
): Strategy {
  const { exists } = d(deps);
  return {
    name: "managed",
    run(ctx: StrategyCtx): StrategyResult {
      const candidate = path.join(getManagedDir(ctx.env), "node_modules", pkgName, entryRelative);
      if (exists(candidate)) return { ok: true, path: candidate };
      return { ok: false, reason: `missing: ${candidate}` };
    },
  };
}

/**
 * Global npm install: `<npm root -g>/<pkg>/<entry>`. Falls back to
 * `{ ok: false }` when `npm root -g` fails or the file is absent.
 */
export function npmGlobalStrategy(
  pkgName: string,
  entryRelative: string = path.join("dist", "index.js"),
  deps?: StrategyDeps,
): Strategy {
  const { exists, npmRootGlobal } = d(deps);
  return {
    name: "npm-global",
    run(): StrategyResult {
      const root = npmRootGlobal();
      if (!root) return { ok: false, reason: "npm root -g failed" };
      const candidate = path.join(root, pkgName, entryRelative);
      if (exists(candidate)) return { ok: true, path: candidate };
      return { ok: false, reason: `missing: ${candidate}` };
    },
  };
}

/**
 * PATH search via `ToolResolver.which()`. This is the plain-old "is it
 * on PATH" strategy and should appear last in most chains.
 *
 * Filters AppImage self-hits via `isAppImageSelfHit` — when the host
 * runs as a Linux AppImage with `executableName: "pi-dashboard"`, the
 * AppImage runtime prepends its squashfs mount to PATH, so the first
 * `which pi-dashboard` hit can be the Electron launcher itself.
 * Trusting that result spawns the Electron app recursively as if it
 * were the dashboard CLI, which never opens the dashboard port and
 * causes the loading screen to hang. Every tool registered via
 * `whereStrategy` inherits this guard transparently.
 *
 * See change: fix-electron-appimage-cli-self-detection (D2).
 */
export function whereStrategy(binaryName: string, deps?: StrategyDeps): Strategy {
  const { which } = d(deps);
  return {
    name: "where",
    run(): StrategyResult {
      const p = which(binaryName);
      if (!p) return { ok: false, reason: `not found on PATH` };
      if (isAppImageSelfHit(p)) {
        return { ok: false, reason: `appimage-self-hit: ${p}` };
      }
      return { ok: true, path: p };
    },
  };
}

/**
 * Bare `import("<pkg>")` — succeeds when the package is reachable from
 * the caller's node_modules tree. We probe synchronously via
 * `createRequire(import.meta.url).resolve(pkgName)`, which follows the
 * same module-resolution algorithm as `import()` but returns a path.
 *
 * The returned path is the resolved entry file; `resolveModule()` then
 * dynamically imports it via `pathToFileURL`. This keeps strategies
 * uniformly sync and keeps the diagnostic trail honest (if the package
 * isn't resolvable, we record the reason here instead of letting it
 * surface as an opaque `import()` throw later).
 *
 * `anchor` determines which node_modules tree we search. Default is
 * this file's URL (i.e. the shared package) — which is typically what
 * callers want: "is pi a dependency of the dashboard?"
 */
export function bareImportStrategy(
  pkgName: string,
  anchor: string = import.meta.url,
  deps?: StrategyDeps,
): Strategy {
  const { resolveModule } = d(deps);
  return {
    name: "bare-import",
    run(): StrategyResult {
      const resolved = resolveModule(pkgName, anchor);
      if (!resolved) return { ok: false, reason: `cannot resolve ${pkgName} from ${anchor}` };
      return { ok: true, path: resolved };
    },
  };
}
