/**
 * Detect whether any LLM-provider credential is configured for Oh My Pi.
 *
 * Sources inspected and OR-merged:
 *  - agent `settings.json` — legacy API-key fields: `anthropicApiKey`,
 *    `openaiApiKey`, `apiKey`, `providers[*].apiKey`.
 *  - agent `auth.json` — legacy credential store shapes
 *      * API-key:  `{ type, key }`
 *      * OAuth:    `{ type, access, refresh, expires, ... }`
 *  - agent `agent.db` — OMP primary store (`auth_credentials` table)
 *
 * "Non-empty" string checks for JSON sources. The detector NEVER throws
 * and never returns/logs credential values.
 *
 * See change: fix-doctor-oauth-credential-detection + OMP host contract.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { getAgentDbPath, getAgentHome } from "./host-profile.js";

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
  const d = data as Record<string, unknown>;
  if (isNonEmptyString(d.anthropicApiKey)) return true;
  if (isNonEmptyString(d.openaiApiKey)) return true;
  if (isNonEmptyString(d.apiKey)) return true;
  const providers = d.providers;
  if (providers && typeof providers === "object") {
    for (const v of Object.values(providers as Record<string, unknown>)) {
      if (
        v &&
        typeof v === "object" &&
        isNonEmptyString((v as Record<string, unknown>).apiKey)
      ) {
        return true;
      }
    }
  }
  return false;
}

function authHasCredential(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  for (const entry of Object.values(data as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (isNonEmptyString(e.key)) return true;
    if (isNonEmptyString(e.access)) return true;
    if (isNonEmptyString(e.refresh)) return true;
  }
  return false;
}

function agentDbHasCredential(homeDir: string): boolean {
  const dbPath = getAgentDbPath({ homedir: homeDir });
  if (!existsSync(dbPath)) return false;
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db
      .prepare(
        `SELECT 1 AS ok FROM auth_credentials
         WHERE disabled_cause IS NULL
         LIMIT 1`,
      )
      .get();
    return !!(row && typeof row === "object");
  } catch {
    return false;
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Returns true if at least one provider credential is configured in
 * agent settings, auth.json, or agent.db.
 *
 * @param homeDir Override for the user's home directory. Defaults to
 *   `os.homedir()`. Pass a tmp dir in tests; never pass user-provided
 *   input — this path is read but not validated.
 */
export function hasAnyProviderCredential(homeDir: string = os.homedir()): boolean {
  const [settingsPath, authPath] = inspectedCredentialFiles(homeDir);
  if (settingsHasCredential(safeReadJson(settingsPath))) return true;
  if (authHasCredential(safeReadJson(authPath))) return true;
  if (agentDbHasCredential(homeDir)) return true;
  return false;
}

/**
 * Absolute JSON paths inspected by `hasAnyProviderCredential`.
 * Surfaced so Doctor's `detail` field can name the files without
 * duplicating the path logic. agent.db is inspected separately.
 */
export function inspectedCredentialFiles(homeDir: string = os.homedir()): [string, string] {
  const agentDir = getAgentHome({ homedir: homeDir });
  return [path.join(agentDir, "settings.json"), path.join(agentDir, "auth.json")];
}
