/**
 * IPC handlers for the first-run wizard (slimmed surface).
 *
 * Registered in the main process, called from the wizard renderer via the
 * preload bridge. Pre-slim handler surface (mode-selection, bridge-install,
 * API-key, recommended-only-step, v2-status/packages/error) was deleted in
 * change: streamline-electron-bootstrap-and-recovery (Group 8).
 *
 * Remaining surface:
 *   - `wizard:detect`                      — detect system pi / openspec / node for skipPackages
 *   - `wizard:get-catalog`                 — assembled three-tier catalog (offline-cache + bundled-git)
 *   - `wizard:save-selection`              — write `installable.json` with user toggles
 *   - `wizard:install-standalone`          — core install (pi-coding-agent, openspec, tsx)
 *   - `wizard:install-bundled-extensions`  — activate selected bundled extensions
 *   - `wizard:request-launch-path`         — stash deep-link path for main.ts to consume
 *
 * Progress for both installers is forwarded on the `wizard:progress` channel.
 */
import { ipcMain, type BrowserWindow } from "electron";
import path from "node:path";
import {
  detectPi,
  detectOpenSpec,
  detectSystemNode,
} from "./dependency-detector.js";
import {
  installStandalone,
  installRecommendedExtensions,
  installBundledExtensions,
  type InstallProgress,
} from "./dependency-installer.js";
import { assembleCatalog } from "./installable-catalog.js";
import { writeAuditEntry } from "./audit-log.js";
import {
  writeInstallableList,
  type InstallableList,
  type InstallablePackage,
} from "@blackbelt-technology/pi-dashboard-shared/installable-list.js";
import { existsSync, readFileSync, readdirSync } from "node:fs";

/**
 * Module-local stash for the deep-link path requested by the wizard's
 * "Configure API keys" button. Read by main.ts via `getRequestedLaunchPath`
 * after the wizard window closes. Reset to null after consumption.
 */
let requestedLaunchPath: string | null = null;

/** Read and clear the wizard's deep-link request. Single-consumer API. */
export function consumeRequestedLaunchPath(): string | null {
  const path = requestedLaunchPath;
  requestedLaunchPath = null;
  return path;
}

/**
 * Augment the catalog from `assembleCatalog` with the manifest `id` for
 * each bundled-extension row. The `id` is the directory name under
 * `<resourcesPath>/bundled-extensions/` and matches `RECOMMENDED_EXTENSIONS`
 * ids — used by `installBundledExtensions` / `installRecommendedExtensions`.
 *
 * `assembleCatalog` itself returns rows shaped to `InstallablePackage` and
 * stops at `name` / `version` / `displayName`; this helper layers the `id`
 * back on so the renderer can map a selected extension to its activator id
 * without re-reading the resources tree.
 */
function buildCatalogForWizard(resourcesPath: string | undefined): InstallableList {
  const catalog = assembleCatalog({ resourcesPath: resourcesPath ?? "" });
  if (!resourcesPath) return catalog;

  const bundledDir = path.join(resourcesPath, "bundled-extensions");
  if (!existsSync(bundledDir)) return catalog;

  let dirNames: string[];
  try {
    dirNames = readdirSync(bundledDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return catalog;
  }

  for (const id of dirNames) {
    const pkgJsonPath = path.join(bundledDir, id, "package.json");
    if (!existsSync(pkgJsonPath)) continue;
    let parsed: { name?: string };
    try {
      parsed = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    } catch {
      continue;
    }
    if (!parsed.name) continue;
    const row = catalog.packages.find(
      (p) => p.name === parsed.name && p.kind === "pi-extension",
    );
    if (row) {
      (row as InstallablePackage & { id?: string }).id = id;
    }
  }

  return catalog;
}

/**
 * Register all wizard IPC handlers. Call once from main.ts.
 */
export function registerWizardIpc(getWizardWindow: () => BrowserWindow | null): void {
  ipcMain.removeHandler("wizard:detect");
  ipcMain.handle("wizard:detect", async () => {
    const [pi, openspec, node] = await Promise.all([
      Promise.resolve(detectPi()),
      Promise.resolve(detectOpenSpec()),
      Promise.resolve(detectSystemNode()),
    ]);
    return {
      pi: { found: pi.found, source: pi.source },
      openspec: { found: openspec.found, source: openspec.source },
      node: { found: node.found, source: node.source },
    };
  });

  ipcMain.removeHandler("wizard:get-catalog");
  ipcMain.handle("wizard:get-catalog", async (): Promise<InstallableList> => {
    const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
    return buildCatalogForWizard(resourcesPath);
  });

  ipcMain.removeHandler("wizard:save-selection");
  ipcMain.handle(
    "wizard:save-selection",
    async (_event, list: InstallableList): Promise<void> => {
      // Stamp the schemaVersion / version envelope when missing so the
      // file on disk is always a valid v2 InstallableList.
      const normalized: InstallableList = {
        version: list.version ?? "1.0",
        schemaVersion: 2,
        packages: list.packages ?? [],
      };
      await writeInstallableList(normalized);
    },
  );

  ipcMain.removeHandler("wizard:install-standalone");
  ipcMain.handle("wizard:install-standalone", async (_event, skipPackages?: string[]) => {
    const win = getWizardWindow();
    try {
      await installStandalone((progress) => {
        win?.webContents.send("wizard:progress", progress);
      }, skipPackages);
      writeAuditEntry({
        operation: "wizard.install",
        packages: [],
        skipped: skipPackages ?? [],
        outcome: "ok",
      });
    } catch (err) {
      writeAuditEntry({
        operation: "wizard.install",
        packages: [],
        skipped: skipPackages ?? [],
        outcome: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  });

  ipcMain.removeHandler("wizard:install-bundled-extensions");
  ipcMain.handle(
    "wizard:install-bundled-extensions",
    async (_event, ids: string[]): Promise<{ installed: number }> => {
      const win = getWizardWindow();
      const forward = (progress: InstallProgress) => {
        win?.webContents.send("wizard:progress", progress);
      };
      // Bundled extensions live under `resources/bundled-extensions/` and
      // are first activated via `installBundledExtensions` (copy-into-cache
      // + settings registration). Any ids the user selected that aren't
      // covered by the bundled-extensions resource fall through to the
      // dynamic `installRecommendedExtensions` path (git clone + pi
      // package manager).
      const bundledIds = await installBundledExtensions(forward);
      const skipSet = new Set(bundledIds);
      const dynamic = (ids ?? []).filter((id) => !skipSet.has(id));
      let installed = bundledIds.length;
      if (dynamic.length > 0) {
        installed += await installRecommendedExtensions(dynamic, forward, skipSet);
      }
      return { installed };
    },
  );

  ipcMain.removeHandler("wizard:request-launch-path");
  ipcMain.handle(
    "wizard:request-launch-path",
    async (_event, pathWithQuery: string): Promise<void> => {
      // Reject pathological inputs; only accept absolute paths within the
      // dashboard origin (no protocol, no `//host` shorthand).
      if (
        typeof pathWithQuery !== "string" ||
        !pathWithQuery.startsWith("/") ||
        pathWithQuery.startsWith("//")
      ) {
        return;
      }
      requestedLaunchPath = pathWithQuery;
    },
  );
}
