/**
 * Detect whether any LLM-provider credential is configured for OMP.
 *
 * Sources are inspected and OR-merged:
 *  - `~/.omp/agent/settings.json` — legacy API-key fields written by the
 *    first-run wizard or user-edited config: `anthropicApiKey`,
 *    `openaiApiKey`, `apiKey`, `providers[*].apiKey`.
 *  - `~/.omp/agent/agent.db` — active `auth_credentials` rows (`disabled_cause IS NULL`)
 *    from current Oh My Pi auth storage.
 *  - `~/.omp/agent/auth.json` — legacy provider credential store.
 *
 * "Non-empty" = `typeof v === "string" && v.trim().length > 0`.
 * Empty strings, whitespace, null, undefined, and non-string values do
 * NOT count as configured.
 *
 * The detector NEVER throws; parse / DB failures are treated as "no
 * credential from that source" and fall through to the others.
 *
 * The detector NEVER returns, logs, or hashes credential values — only
 * the boolean result and (via `inspectedCredentialFiles`) the file
 * paths it looked at.
 *
 * See change: fix-doctor-oauth-credential-detection.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

type DatabaseSyncCtor = typeof import("node:sqlite").DatabaseSync;

interface AuthDbRow {
  data: string;
}

const require = createRequire(import.meta.url);

function loadDatabaseSync(): DatabaseSyncCtor | null {
  try {
    const sqlite = require("node:sqlite") as { DatabaseSync?: DatabaseSyncCtor };
    return sqlite.DatabaseSync ?? null;
  } catch {
    return null;
  }
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function safeReadJson(file: string): unknown {
  try {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function settingsHasCredential(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  if (isNonEmptyString(record.anthropicApiKey)) return true;
  if (isNonEmptyString(record.openaiApiKey)) return true;
  if (isNonEmptyString(record.apiKey)) return true;
  const providers = record.providers;
  if (providers && typeof providers === "object") {
    for (const value of Object.values(providers as Record<string, unknown>)) {
      if (value && typeof value === "object" && isNonEmptyString((value as Record<string, unknown>).apiKey)) {
        return true;
      }
    }
  }
  return false;
}

function entryHasCredential(entry: Record<string, unknown>): boolean {
  return isNonEmptyString(entry.key)
    || isNonEmptyString(entry.access)
    || isNonEmptyString(entry.refresh);
}

function authHasCredential(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  for (const entry of Object.values(data as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    if (entryHasCredential(entry as Record<string, unknown>)) return true;
  }
  return false;
}

function dbHasCredential(dbPath: string): boolean {
  if (!existsSync(dbPath)) return false;
  const DatabaseSync = loadDatabaseSync();
  if (!DatabaseSync) return false;
  let db: InstanceType<DatabaseSyncCtor> | null = null;
  try {
    db = new DatabaseSync(dbPath);
    const table = db
      .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'auth_credentials'")
      .get() as { present?: number } | undefined;
    if (table?.present !== 1) return false;

    const rows = db.prepare(`
      SELECT data
      FROM auth_credentials
      WHERE disabled_cause IS NULL
    `).all() as unknown as AuthDbRow[];

    for (const row of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.data);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      if (entryHasCredential(parsed as Record<string, unknown>)) return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    try { db?.close(); } catch { /* ignore close errors */ }
  }
}

/**
 * Returns true if at least one provider credential is configured in
 * `~/.omp/agent/settings.json`, `~/.omp/agent/agent.db`, or
 * `~/.omp/agent/auth.json`.
 *
 * @param homeDir Override for the user's home directory. Defaults to
 *   `os.homedir()`. Pass a tmp dir in tests; never pass user-provided
 *   input — this path is read but not validated.
 */
export function hasAnyProviderCredential(homeDir: string = os.homedir()): boolean {
  const [settingsPath, agentDbPath, authPath] = inspectedCredentialFiles(homeDir);
  if (settingsHasCredential(safeReadJson(settingsPath))) return true;
  if (dbHasCredential(agentDbPath)) return true;
  if (authHasCredential(safeReadJson(authPath))) return true;
  return false;
}

/**
 * Absolute paths inspected by `hasAnyProviderCredential`, in inspection
 * order. Surfaced so Doctor's `detail` field can name the files without
 * duplicating the path logic.
 */
export function inspectedCredentialFiles(homeDir: string = os.homedir()): [string, string, string] {
  const agentDir = path.join(homeDir, ".omp", "agent");
  return [
    path.join(agentDir, "settings.json"),
    path.join(agentDir, "agent.db"),
    path.join(agentDir, "auth.json"),
  ];
}
