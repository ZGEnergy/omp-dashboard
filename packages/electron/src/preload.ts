/**
 * Preload script for Electron renderer (wizard window + main loading page).
 * Exposes IPC APIs to the renderer via contextBridge.
 *
 * Slimmed-wizard surface (change: streamline-electron-bootstrap-and-recovery,
 * Group 8): the wizard API is now four operations — get the catalog, save
 * the user's selection, install the core, activate selected bundled
 * extensions — plus a deep-link request used by the "Configure API keys"
 * button on the done step. The mode-selection / bridge-install / API-key /
 * recommended / v2-status / v2-packages handlers are gone.
 */
import { contextBridge, ipcRenderer } from "electron";
import type { InstallableList } from "@blackbelt-technology/pi-dashboard-shared/installable-list.js";
// Register the doctor bridge namespace on the same preload bundle.
// Side-effect import — `doctor-preload.ts` calls contextBridge.exposeInMainWorld.
// See change: doctor-rich-output.
import "./preload/doctor-preload.js";

export interface WizardApi {
  /** Detect installed tools (used to build skipPackages for install-standalone). */
  detectDependencies: () => Promise<{
    pi: { found: boolean; source?: string };
    openspec: { found: boolean; source?: string };
    node: { found: boolean; source?: string };
  }>;
  /** Read the bundled catalog (offline-cache core + bundled-git extensions). */
  getCatalog: () => Promise<InstallableList>;
  /** Persist the user's selection to `~/.pi/dashboard/installable.json`. */
  saveSelection: (list: InstallableList) => Promise<void>;
  /** Run the core (`installStandalone`) install. Optionally skip system-installed pkgs. */
  installStandalone: (skipPackages?: string[]) => Promise<void>;
  /** Activate selected bundled extensions by manifest id. */
  installBundledExtensions: (ids: string[]) => Promise<{ installed: number }>;
  /** Listen for install progress events (fired by both installers above). */
  onInstallProgress: (
    callback: (progress: { step: string; status: string; error?: string; output?: string }) => void,
  ) => void;
  /**
   * Request that the main dashboard window load at a specific path after the
   * wizard closes. Used by the "Configure API keys" deep-link on step-done.
   */
  requestLaunchPath: (pathWithQuery: string) => Promise<void>;
  /** Open the Doctor diagnostic window. See change: doctor-rich-output (task 3.7). */
  openDoctor: () => void;
}

const api: WizardApi = {
  detectDependencies: () => ipcRenderer.invoke("wizard:detect"),
  getCatalog: () => ipcRenderer.invoke("wizard:get-catalog"),
  saveSelection: (list) => ipcRenderer.invoke("wizard:save-selection", list),
  installStandalone: (skipPackages) => ipcRenderer.invoke("wizard:install-standalone", skipPackages),
  installBundledExtensions: (ids) => ipcRenderer.invoke("wizard:install-bundled-extensions", ids),
  onInstallProgress: (callback) => {
    ipcRenderer.on("wizard:progress", (_event, progress) => callback(progress));
  },
  requestLaunchPath: (pathWithQuery) => ipcRenderer.invoke("wizard:request-launch-path", pathWithQuery),
  openDoctor: () => ipcRenderer.send("wizard:open-doctor"),
};

contextBridge.exposeInMainWorld("wizardApi", api);

// ── piDashboard API ───────────────────────────────────────────────────────────────────
// User-initiated server-launch controls used by the loading page (and any
// future in-app retry control). See change: electron-server-launch-controls.
// Same preload is attached to both the loading page and the wizard window;
// each renderer uses only the namespace it needs.

export interface PiDashboardLaunchOutcome {
  kind: "already-running" | "started" | "failed";
  url?: string;
  reason?: string;
  logTail?: string;
}

export interface PiDashboardLaunchStatus {
  // Recovery phases added by change: streamline-electron-bootstrap-and-recovery.
  phase:
    | "starting"
    | "shutting-down-existing"
    | "spawning"
    | "waiting-health"
    | "ready"
    | "failed"
    | "reinstalling"
    | "wiping"
    | "force-reinstalling";
  message?: string;
  url?: string;
}

/**
 * Single inventory entry. Matches `PackageDiff` in
 * `packages/electron/src/lib/preflight-reconcile.ts` — exported here as a
 * structural mirror so the renderer doesn't need to import from `lib/`.
 */
export interface PiDashboardInventoryEntry {
  pkg: string;
  installed: string | null;
  expected: string | null;
  status: "missing" | "stale" | "current" | "corrupt";
}

export interface PiDashboardInventoryDiff {
  diffs: PiDashboardInventoryEntry[];
  missing: string[];
  stale: string[];
  corrupt: string[];
  upToDate: string[];
  needsAction: boolean;
  /** Human-readable diagnosis string for the loading page, or null when no action needed. */
  diagnosis?: string | null;
}

export interface PiDashboardReinstallOutcome {
  kind: "ok" | "failed";
  reason?: string;
  /** Packages that were targeted (i.e. not in skip list). */
  attempted?: string[];
}

export interface PiDashboardForceReinstallOutcome {
  kind: "ok" | "failed" | "cancelled";
  reason?: string;
  wiped?: string[];
  preserved?: string[];
}

export interface PiDashboardInstallProgress {
  step: string;
  status: "pending" | "running" | "done" | "error";
  output?: string;
  error?: string;
}

export interface PiDashboardApi {
  requestLaunch: (force?: boolean) => Promise<PiDashboardLaunchOutcome>;
  openDoctor: () => void;
  readServerLog: (lines?: number) => Promise<string>;
  onStatus: (cb: (status: PiDashboardLaunchStatus) => void) => () => void;
  // Added by change: streamline-electron-bootstrap-and-recovery (Group 5).
  checkManagedInventory: () => Promise<PiDashboardInventoryDiff>;
  reinstallManaged: () => Promise<PiDashboardReinstallOutcome>;
  forceReinstall: () => Promise<PiDashboardForceReinstallOutcome>;
  onInstallProgress: (cb: (p: PiDashboardInstallProgress) => void) => () => void;
}

const piDashboard: PiDashboardApi = {
  requestLaunch: (force) => ipcRenderer.invoke("dashboard:request-launch", { force: !!force }),
  openDoctor: () => ipcRenderer.send("dashboard:open-doctor"),
  readServerLog: (lines) => ipcRenderer.invoke("dashboard:read-server-log", { lines: lines ?? 20 }),
  onStatus: (cb) => {
    const listener = (_e: unknown, payload: PiDashboardLaunchStatus) => cb(payload);
    ipcRenderer.on("dashboard:launch-status", listener);
    return () => { ipcRenderer.removeListener("dashboard:launch-status", listener); };
  },
  checkManagedInventory: () => ipcRenderer.invoke("dashboard:check-inventory"),
  reinstallManaged: () => ipcRenderer.invoke("dashboard:reinstall-managed"),
  forceReinstall: () => ipcRenderer.invoke("dashboard:force-reinstall"),
  onInstallProgress: (cb) => {
    const listener = (_e: unknown, payload: PiDashboardInstallProgress) => cb(payload);
    ipcRenderer.on("dashboard:install-progress", listener);
    return () => { ipcRenderer.removeListener("dashboard:install-progress", listener); };
  },
};

contextBridge.exposeInMainWorld("piDashboard", piDashboard);
