/**
 * Recovery IPC handlers — wire the preflight-reconcile and force-reinstall
 * modules to the loading page's `piDashboard` preload bridge.
 *
 * Channels (all `dashboard:*`):
 *   - `dashboard:check-inventory`      → returns inventory diff
 *   - `dashboard:reinstall-managed`    → selective reinstall, streams progress
 *   - `dashboard:force-reinstall`      → confirm dialog + safe-wipe + install
 *
 * Progress events broadcast on `dashboard:install-progress` (per-package)
 * AND `dashboard:launch-status` (high-level phase). Both channels carry
 * the new recovery phases declared in `preload.ts`.
 *
 * See change: streamline-electron-bootstrap-and-recovery (Group 5).
 */
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import {
  runPreflight,
  formatDiagnosis,
  type InventoryDiff,
} from "./preflight-reconcile.js";
import {
  forceReinstall,
  planSafeWipe,
  type InstallStandaloneFn,
} from "./force-reinstall.js";
import { MANAGED_DIR } from "./managed-paths.js";
import { getBundledNodePath } from "./bundled-node.js";
import { writeAuditEntry } from "./audit-log.js";

// ── Renderer-facing payload shapes (mirror preload.ts types) ───────────────

interface InventoryEntry {
  pkg: string;
  installed: string | null;
  expected: string | null;
  status: "missing" | "stale" | "current" | "corrupt";
}
interface InventoryDiffPayload {
  diffs: InventoryEntry[];
  missing: string[];
  stale: string[];
  corrupt: string[];
  upToDate: string[];
  needsAction: boolean;
  diagnosis: string | null;
}
interface ReinstallOutcome {
  kind: "ok" | "failed";
  reason?: string;
  attempted?: string[];
}
interface ForceReinstallOutcome {
  kind: "ok" | "failed" | "cancelled";
  reason?: string;
  wiped?: string[];
  preserved?: string[];
}
interface InstallProgress {
  step: string;
  status: "pending" | "running" | "done" | "error";
  output?: string;
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert the lib's `InventoryDiff` (Map-friendly internal shape) to the
 * renderer-facing payload. Always attaches the formatted diagnosis.
 */
function toPayload(diff: InventoryDiff): InventoryDiffPayload {
  return {
    diffs: diff.diffs.map((d) => ({
      pkg: d.pkg,
      installed: d.installed,
      expected: d.expected,
      status: d.status,
    })),
    missing: diff.missing,
    stale: diff.stale,
    corrupt: diff.corrupt,
    upToDate: diff.upToDate,
    needsAction: diff.needsAction,
    diagnosis: formatDiagnosis(diff),
  };
}

/** Broadcast a per-package progress event to every renderer. */
function broadcastProgress(p: InstallProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send("dashboard:install-progress", p);
    } catch {
      /* renderer may have navigated away */
    }
  }
}

/** Broadcast a high-level launch-status phase update to every renderer. */
function broadcastStatus(phase: string, message?: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send("dashboard:launch-status", { phase, message });
    } catch {
      /* renderer may have navigated away */
    }
  }
}

/** Resolve the bundled-Node source dir (parent of node/bin/node on Unix, parent of node.exe on Win). */
function resolveBundledNodeDir(): string | null {
  const bundledNodeBinary = getBundledNodePath();
  if (!bundledNodeBinary) return null;
  return process.platform === "win32"
    ? path.dirname(bundledNodeBinary)
    : path.dirname(path.dirname(bundledNodeBinary));
}

// ── Inflight guards ────────────────────────────────────────────────────────

let inflightReinstall: Promise<ReinstallOutcome> | null = null;
let inflightForceReinstall: Promise<ForceReinstallOutcome> | null = null;

// ── Registration ───────────────────────────────────────────────────────────

export interface RecoveryIpcOptions {
  /** Injected installer (defaults to dependency-installer.installStandalone). */
  installStandalone: InstallStandaloneFn;
  /** Override managed dir (tests). */
  managedDir?: string;
  /** Override resources path (tests). */
  resourcesPath?: string;
}

/**
 * Register recovery IPC handlers. Idempotent — safe to call multiple times
 * (handlers are removed + re-registered).
 */
export function registerRecoveryIpc(opts: RecoveryIpcOptions): void {
  const managedDir = opts.managedDir ?? MANAGED_DIR;
  const resourcesPath = opts.resourcesPath ?? (process as any).resourcesPath ?? undefined;

  // ── dashboard:check-inventory ────────────────────────────────────────────
  ipcMain.removeHandler("dashboard:check-inventory");
  ipcMain.handle("dashboard:check-inventory", async (): Promise<InventoryDiffPayload> => {
    try {
      const diff = runPreflight({ managedDir, resourcesPath });
      return toPayload(diff);
    } catch (err: any) {
      console.error("[recovery-ipc] inventory read failed:", err?.message ?? err);
      // Surface as empty/no-action so the renderer doesn't show a stale
      // diagnosis row. The diagnosis field carries the error for debugging.
      return {
        diffs: [],
        missing: [],
        stale: [],
        corrupt: [],
        upToDate: [],
        needsAction: false,
        diagnosis: `Inventory read failed: ${err?.message ?? err}`,
      };
    }
  });

  // ── dashboard:reinstall-managed ──────────────────────────────────────────
  ipcMain.removeHandler("dashboard:reinstall-managed");
  ipcMain.handle("dashboard:reinstall-managed", async (): Promise<ReinstallOutcome> => {
    // Coalesce concurrent requests onto the same inflight Promise.
    if (inflightReinstall) return inflightReinstall;

    inflightReinstall = (async (): Promise<ReinstallOutcome> => {
      try {
        broadcastStatus("reinstalling", "Reinstalling managed packages…");
        const diff = runPreflight({ managedDir, resourcesPath });

        const attempted = diff.diffs
          .filter((d) => d.status !== "current")
          .map((d) => d.pkg);

        await opts.installStandalone((p) => {
          broadcastProgress(p as InstallProgress);
        }, diff.upToDate);

        broadcastStatus("ready", "Reinstall complete");
        return { kind: "ok", attempted };
      } catch (err: any) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error("[recovery-ipc] reinstall failed:", reason);
        broadcastStatus("failed", `Reinstall failed: ${reason}`);
        return { kind: "failed", reason };
      } finally {
        inflightReinstall = null;
      }
    })();

    return inflightReinstall;
  });

  // ── dashboard:force-reinstall ────────────────────────────────────────────
  ipcMain.removeHandler("dashboard:force-reinstall");
  ipcMain.handle("dashboard:force-reinstall", async (): Promise<ForceReinstallOutcome> => {
    if (inflightForceReinstall) return inflightForceReinstall;

    // Confirm via modal dialog. Cancel is default — explicit safety.
    const plan = planSafeWipe(managedDir);
    const wipeCount = plan.wipe.length;
    const preserveCount = plan.preserve.length;

    const { response } = await dialog.showMessageBox({
      type: "warning",
      title: "PI Dashboard",
      message: "Force reinstall managed packages?",
      detail:
        `This will wipe ${wipeCount} Electron-owned path(s) under ~/.pi-dashboard/ ` +
        `and reinstall from the bundled offline cache.\n\n` +
        `${preserveCount} user-installed path(s) will be preserved. ` +
        `Settings, sessions, and credentials (under ~/.pi/) are unaffected.`,
      buttons: ["Cancel", "Reinstall"],
      defaultId: 0,
      cancelId: 0,
    });

    if (response !== 1) {
      return { kind: "cancelled" };
    }

    inflightForceReinstall = (async (): Promise<ForceReinstallOutcome> => {
      try {
        broadcastStatus("force-reinstalling", "Force reinstalling managed packages…");

        const bundledNodeDir = resolveBundledNodeDir();
        const result = await forceReinstall({
          managedDir,
          bundledNodeDir,
          installStandalone: opts.installStandalone,
          onProgress: (msg) => {
            broadcastProgress({ step: "force-reinstall", status: "running", output: msg });
            broadcastStatus("wiping", msg);
          },
        });

        if (!result.ok) {
          broadcastStatus("failed", result.error ?? "Force reinstall failed");
          writeAuditEntry({
            operation: "doctor.force-reinstall",
            packages: plan.wipe,
            outcome: "failed",
            error: result.error,
            details: { wiped: result.wiped?.length ?? 0, preserved: result.preserved?.length ?? 0 },
          });
          return {
            kind: "failed",
            reason: result.error,
            wiped: result.wiped,
            preserved: result.preserved,
          };
        }

        broadcastStatus("ready", "Force reinstall complete");
        writeAuditEntry({
          operation: "doctor.force-reinstall",
          packages: plan.wipe,
          outcome: "ok",
          details: { wiped: result.wiped?.length ?? 0, preserved: result.preserved?.length ?? 0 },
        });
        return { kind: "ok", wiped: result.wiped, preserved: result.preserved };
      } catch (err: any) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error("[recovery-ipc] force reinstall failed:", reason);
        broadcastStatus("failed", `Force reinstall failed: ${reason}`);
        writeAuditEntry({
          operation: "doctor.force-reinstall",
          packages: plan.wipe,
          outcome: "failed",
          error: reason,
        });
        return { kind: "failed", reason };
      } finally {
        inflightForceReinstall = null;
      }
    })();

    return inflightForceReinstall;
  });
}

/** Test helper: clear inflight state. Not used in production. */
export function _resetInflightForTests(): void {
  inflightReinstall = null;
  inflightForceReinstall = null;
}
