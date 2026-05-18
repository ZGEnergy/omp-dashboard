/**
 * Append-only audit log for managed-install operations.
 *
 * Pinned by Group 14.5 of streamline-electron-bootstrap-and-recovery:
 * every reinstall / force-reinstall code path must write a single
 * structured entry containing `{operation, packages, outcome}` so
 * support / smoke-test review can reconstruct what happened on a user's
 * machine.
 *
 * Path: `~/.pi-dashboard/doctor.log` (legacy installer log dir; chosen
 * for parity with Doctor's existing "Open doctor.log" affordance).
 *
 * Each line is a single JSON object terminated by `\n` (JSONL) so tail /
 * grep stays trivial. Writing is best-effort: a logging failure must
 * never break the operation it observes.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/** Operations tracked by the audit log. */
export type AuditOperation =
  | "wizard.install"
  | "preflight.reinstall"
  | "loading-page.reinstall"
  | "doctor.force-reinstall";

/** Terminal outcomes for an audit entry. */
export type AuditOutcome =
  | "ok"
  | "failed"
  | "cancelled";

export interface AuditEntry {
  /** ISO 8601 UTC timestamp. Server log already prefixes the wall time, mirrored here for grep convenience. */
  ts: string;
  /** Which UX surface triggered the operation. */
  operation: AuditOperation;
  /** Whitelist package names attempted by this operation. May be empty (e.g. cancelled). */
  packages: string[];
  /** Names of packages skipped via `installStandalone({ skipPackages })` (already up-to-date). */
  skipped?: string[];
  /** Outcome of the operation. */
  outcome: AuditOutcome;
  /** Error message when outcome === "failed". */
  error?: string;
  /** Optional extra context (e.g. wiped/preserved counts for force-reinstall). */
  details?: Record<string, unknown>;
}

/**
 * Resolve the audit-log path. Honors `$HOME` so tests can re-root.
 */
export function getAuditLogPath(): string {
  return path.join(os.homedir(), ".pi-dashboard", "doctor.log");
}

/**
 * Append one structured entry. Never throws; logging failures land on
 * stderr via console.warn but never propagate. Returns the entry that
 * was written so callers can echo it elsewhere if useful.
 */
export function writeAuditEntry(entry: Omit<AuditEntry, "ts">): AuditEntry {
  const full: AuditEntry = {
    ts: new Date().toISOString(),
    ...entry,
  };
  const line = JSON.stringify(full) + "\n";
  try {
    const logPath = getAuditLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line, { encoding: "utf-8" });
  } catch (err) {
    console.warn(
      `[audit-log] write failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return full;
}
