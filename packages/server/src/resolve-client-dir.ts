/**
 * Pure helper: resolve the dashboard client `dist/` directory from any
 * server-process layout.
 *
 * Extracted from `server.ts` so the resolution chain is unit-testable
 * without booting Fastify.
 *
 * Contract: **durable paths first, volatile (scope-dir) paths after.**
 * Paths under `<managedDir>/node_modules/` are wiped by every `npm install`
 * the bootstrap loop runs, so any candidate inside that subtree is
 * volatile. Paths under `<managedDir>/packages/` (extracted from the
 * bundled DMG) are durable across npm reconciliation. New strategies are
 * inserted at the position consistent with their durability, not by date
 * of addition.
 *
 * Strategy order (first match wins):
 *   1. Managed-install root (durable) \u2014 walks up looking for `.version`
 *      marker, then probes `<managedDir>/packages/dist/client/`. Only
 *      reachable when the server runs from an Electron / standalone
 *      managed install. See changes:
 *        - streamline-electron-bootstrap-and-recovery (Failure 2)
 *        - fix-resolve-client-dir-prefers-durable-managed-path (reorder)
 *   2. Node module resolver (volatile) \u2014
 *      `createRequire(...).resolve("@blackbelt-technology/pi-dashboard-web/package.json")`.
 *      Works in any flat/scoped/pnpm layout.
 *   3. Scoped sibling of server (volatile) \u2014 installed npm layout.
 *   4. Parent-hoisted node_modules (volatile) \u2014 npm v7+ hoist.
 *   5. Monorepo workspace sibling (durable in dev) \u2014
 *      `<serverDir>/../../client/dist`.
 *   6. Legacy `<serverDir>/../../dist/client` (durable).
 */
import path from "node:path";
import { existsSync as fsExistsSync } from "node:fs";
import { resolveManagedDirRoot } from "@blackbelt-technology/pi-dashboard-shared/managed-paths.js";

export interface ResolveClientDirOpts {
  /** `path.dirname(fileURLToPath(import.meta.url))` of the calling server. */
  serverDir: string;
  /** Injectable resolver for the `@blackbelt-technology/pi-dashboard-web` package; returns the package's `package.json` path or null. */
  resolveWebPackage?: () => string | null;
  /** Injectable existence check (defaults to fs.existsSync). */
  existsSync?: (p: string) => boolean;
}

export interface ResolveClientDirResult {
  /** First candidate path that contains `index.html`, or empty string if none. */
  clientDir: string;
  /** Ordered candidate list, regardless of which one succeeded. */
  candidates: string[];
}

export function resolveClientDir(opts: ResolveClientDirOpts): ResolveClientDirResult {
  const existsSync = opts.existsSync ?? fsExistsSync;
  const candidates: string[] = [];

  // 1. Managed-install root (durable) — wins when `.version` marker is
  //    reachable. Probed first so a stale scope-dir wipe between server
  //    boot and the first request cannot strand fastifyStatic on a
  //    deleted path. See change: fix-resolve-client-dir-prefers-durable-managed-path.
  const managedRoot = resolveManagedDirRoot(opts.serverDir, { existsSync });
  if (managedRoot) {
    candidates.push(path.join(managedRoot, "packages", "dist", "client"));
  }

  // 2. Node module resolver (volatile — lives inside node_modules/).
  if (opts.resolveWebPackage) {
    try {
      const pkgJson = opts.resolveWebPackage();
      if (pkgJson) candidates.push(path.join(path.dirname(pkgJson), "dist"));
    } catch {
      /* fall through */
    }
  }

  // 3–6.
  candidates.push(
    path.join(opts.serverDir, "..", "..", "pi-dashboard-web", "dist"),
    path.join(opts.serverDir, "..", "..", "..", "@blackbelt-technology", "pi-dashboard-web", "dist"),
    path.join(opts.serverDir, "..", "..", "client", "dist"),
    path.join(opts.serverDir, "..", "..", "dist", "client"),
  );

  const clientDir =
    candidates.find((p) => existsSync(path.join(p, "index.html"))) ?? "";
  return { clientDir, candidates };
}
