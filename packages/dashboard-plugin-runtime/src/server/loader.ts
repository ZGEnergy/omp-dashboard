/**
 * Plugin loader: discovers manifests and loads server entries.
 *
 * Discovery globs packages/* /package.json (without space) once per process.
 * Both the Vite plugin and loadServerEntries share the discovery result
 * via a module-level cache.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import crypto from "node:crypto";
import { validateManifest, ManifestValidationError } from "../manifest-validator.js";
import type { PluginManifest } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/manifest-types.js";
import type { ServerPluginContext } from "./server-context.js";
import { createPluginStatusStore, type PluginStatusStore } from "./plugin-status-store.js";

// ── Discovery cache ────────────────────────────────────────────────────────

export interface DiscoveredPlugin {
  manifest: PluginManifest;
  packageDir: string;
  /** Absolute path to the server entry (if declared and resolved). */
  serverEntryPath?: string;
  /** Absolute path to the bridge entry (if declared and resolved). */
  bridgeEntryPath?: string;
  /** Absolute path to the client entry (if declared and resolved). */
  clientEntryPath?: string;
}

let _discoveryCache: DiscoveredPlugin[] | null = null;

/**
 * Find the monorepo root by walking up from `import.meta.url` looking for
 * a `pnpm-workspace.yaml` or a `package.json` with a top-level `workspaces`
 * field. Returns the absolute path to the root if found, null otherwise.
 *
 * This survives wherever the dashboard-plugin-runtime package is installed:
 * inside the monorepo, in node_modules of an installed dashboard, or inside
 * Electron's bundled resources.
 */
export function findMonorepoRoot(startDir?: string): string | null {
  let dir = startDir ?? path.dirname(url.fileURLToPath(import.meta.url));
  const stop = path.parse(dir).root;
  while (dir !== stop) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const pkgJson = path.join(dir, "package.json");
    if (fs.existsSync(pkgJson)) {
      try {
        const raw = JSON.parse(fs.readFileSync(pkgJson, "utf-8")) as Record<string, unknown>;
        if (raw.workspaces) return dir;
      } catch {
        // continue walking up
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Return `~/.pi/dashboard/plugins/` if it exists; null otherwise.
 * This is where user-installed plugins live (per `add-plugin-activation-ui`).
 */
export function findInstalledPluginsDir(): string | null {
  const dir = path.join(os.homedir(), ".pi", "dashboard", "plugins");
  return fs.existsSync(dir) ? dir : null;
}

/**
 * Return the bundled-plugins directory shipped alongside the dashboard
 * server (Electron resources, npm-global install layout). Walks up from
 * `import.meta.url` to find `resources/plugins/` or equivalent.
 */
export function findBundledPluginsDir(): string | null {
  let dir = path.dirname(url.fileURLToPath(import.meta.url));
  const stop = path.parse(dir).root;
  while (dir !== stop) {
    const candidate = path.join(dir, "resources", "plugins");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Discover plugin manifests from the monorepo, user-installed plugins, and
 * bundled-resources plugins (in that priority order).
 *
 * Results are cached for the process lifetime. Pass an explicit `repoRoot`
 * to force discovery from a specific directory (useful for tests).
 */
export function discoverPlugins(repoRoot?: string): DiscoveredPlugin[] {
  if (_discoveryCache !== null) return _discoveryCache;

  const searchDirs: string[] = [];

  if (repoRoot) {
    // Explicit override (test or build-time call site): keep legacy behaviour.
    searchDirs.push(path.join(repoRoot, "packages"));
  } else {
    const monorepo = findMonorepoRoot();
    if (monorepo) searchDirs.push(path.join(monorepo, "packages"));
    const installed = findInstalledPluginsDir();
    if (installed) searchDirs.push(installed);
    const bundled = findBundledPluginsDir();
    if (bundled) searchDirs.push(bundled);
  }

  const results: DiscoveredPlugin[] = [];
  const seenIds = new Set<string>();

  for (const packagesDir of searchDirs) {
    if (!fs.existsSync(packagesDir)) continue;

    let entries: string[];
    try {
      entries = fs.readdirSync(packagesDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const pkgDir = path.join(packagesDir, entry);
      const pkgJson = path.join(pkgDir, "package.json");
      if (!fs.existsSync(pkgJson)) continue;

      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(fs.readFileSync(pkgJson, "utf-8"));
      } catch {
        continue;
      }

      // Check for adjacent dashboard-plugin.json (takes precedence)
      const adjacentJson = path.join(pkgDir, "dashboard-plugin.json");
      let manifestRaw: unknown = raw["pi-dashboard-plugin"];

      if (fs.existsSync(adjacentJson)) {
        if (manifestRaw !== undefined) {
          console.warn(
            `[plugin-loader] Both package.json#pi-dashboard-plugin and dashboard-plugin.json found in ${pkgDir}. Using dashboard-plugin.json.`,
          );
        }
        try {
          manifestRaw = JSON.parse(fs.readFileSync(adjacentJson, "utf-8"));
        } catch {
          continue;
        }
      }

      if (manifestRaw === undefined || manifestRaw === null) continue;

      let manifest: PluginManifest;
      try {
        manifest = validateManifest(manifestRaw);
      } catch (e) {
        console.error(`[plugin-loader] Validation failed for package at ${pkgDir}:`, e);
        continue;
      }

      // Earlier search dirs win on ID collisions (monorepo > installed > bundled).
      if (seenIds.has(manifest.id)) continue;
      seenIds.add(manifest.id);

      const resolve = (rel: string | undefined) =>
        rel ? path.resolve(pkgDir, rel) : undefined;

      results.push({
        manifest,
        packageDir: pkgDir,
        serverEntryPath: resolve(manifest.server),
        bridgeEntryPath: resolve(manifest.bridge),
        clientEntryPath: resolve(manifest.client),
      });
    }
  } // end for searchDirs

  // Sort by (priority asc, id asc)
  results.sort((a, b) => {
    const pa = a.manifest.priority ?? 1000;
    const pb = b.manifest.priority ?? 1000;
    if (pa !== pb) return pa - pb;
    return a.manifest.id.localeCompare(b.manifest.id);
  });

  console.log(
    `[plugin-loader] discovered ${results.length} plugin(s): ${results
      .map((p) => p.manifest.id)
      .join(", ") || "(none)"}`,
  );

  _discoveryCache = results;
  return results;
}

/** Clear the discovery cache (for testing). */
export function clearDiscoveryCache(): void {
  _discoveryCache = null;
}

// ── Status store singleton ─────────────────────────────────────────────────

let _statusStore: PluginStatusStore | null = null;

export function getPluginStatusStore(): PluginStatusStore {
  if (!_statusStore) _statusStore = createPluginStatusStore();
  return _statusStore;
}

// ── Registry hash (build- and runtime-shared) ──────────────────────

/**
 * Deterministic serialization of the discovered plugin set, used for
 * staleness detection. Sorts plugins by id, sorts claims by
 * (slot, component, predicate, command) lexicographically. Two
 * discoveries against the same plugin set produce the same string;
 * adding/removing a plugin or claim changes it.
 *
 * Shared between the vite-plugin (build-time) and the dashboard server
 * (runtime) so `PLUGIN_REGISTRY_HASH` and `/api/health.bundleHash`
 * compare apples-to-apples.
 *
 * See change: fix-pi-flows-end-to-end (Group 6).
 */
export function deterministicSerializePlugins(
  plugins: ReadonlyArray<{ manifest: PluginManifest }>,
): string {
  const plain = plugins
    .map((p) => ({
      id: p.manifest.id,
      version: (p.manifest as { version?: string }).version ?? null,
      claims: p.manifest.claims
        .map((c) => ({
          slot: c.slot,
          component: c.component ?? null,
          predicate: c.predicate ?? null,
          shouldRender: c.shouldRender ?? null,
          command: c.command ?? null,
          tab: c.tab ?? null,
          toolName: c.toolName ?? null,
        }))
        .sort((a, b) =>
          [a.slot, a.component, a.predicate, a.command]
            .map((x) => x ?? "")
            .join("\0")
            .localeCompare(
              [b.slot, b.component, b.predicate, b.command]
                .map((x) => x ?? "")
                .join("\0"),
            ),
        ),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(plain);
}

/** SHA-256 hex digest of the deterministic registry serialization. */
export function pluginRegistryHash(
  plugins: ReadonlyArray<{ manifest: PluginManifest }>,
): string {
  return crypto
    .createHash("sha256")
    .update(deterministicSerializePlugins(plugins))
    .digest("hex");
}

/** Reset the status store (for testing). */
export function clearStatusStore(): void {
  _statusStore = null;
}

// ── Server-side loader ─────────────────────────────────────────────────────

export interface ServerLoadDeps {
  /** Factory that creates a ServerPluginContext for a specific plugin. */
  createContext: (plugin: DiscoveredPlugin) => ServerPluginContext;
  /** Config accessor: is this plugin enabled? */
  isEnabled: (pluginId: string) => boolean;
  /** Repo root for discovery (defaults to cwd). */
  repoRoot?: string;
}

/**
 * Discover plugins and load each enabled plugin's server entry.
 * Awaits each plugin's registerPlugin() before proceeding.
 * Plugin failures are caught, logged, and reflected in the status store.
 */
export async function loadServerEntries(deps: ServerLoadDeps): Promise<void> {
  const store = getPluginStatusStore();
  const plugins = discoverPlugins(deps.repoRoot);

  for (const plugin of plugins) {
    const { manifest } = plugin;
    const enabled = deps.isEnabled(manifest.id);

    if (!enabled) {
      store.setStatus({
        id: manifest.id,
        enabled: false,
        loaded: false,
        claims: manifest.claims.length,
      });
      continue;
    }

    if (!plugin.serverEntryPath) {
      // No server entry — still mark as loaded (client-only plugin)
      store.setStatus({
        id: manifest.id,
        enabled: true,
        loaded: true,
        claims: manifest.claims.length,
      });
      continue;
    }

    const ctx = deps.createContext(plugin);
    try {
      const mod = await import(plugin.serverEntryPath);
      if (typeof mod.default !== "function") {
        throw new Error(`Server entry at ${plugin.serverEntryPath} has no default export function`);
      }
      await mod.default(ctx);
      store.setStatus({
        id: manifest.id,
        enabled: true,
        loaded: true,
        claims: manifest.claims.length,
      });
      console.info(`[plugin-loader] Loaded plugin "${manifest.id}"`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      store.setStatus({
        id: manifest.id,
        enabled: true,
        loaded: false,
        error: msg,
        claims: manifest.claims.length,
      });
      console.error(`[plugin-loader] Failed to load plugin "${manifest.id}": ${msg}`);
    }
  }
}
