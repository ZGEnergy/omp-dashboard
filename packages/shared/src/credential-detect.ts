/**
 * Detect whether any LLM-provider credential is configured for pi.
 *
 * Two sources are inspected and OR-merged:
 *  - `~/.pi/agent/settings.json` — legacy API-key fields written by the
 *    first-run wizard or user-edited config: `anthropicApiKey`,
 *    `openaiApiKey`, `apiKey`, `providers[*].apiKey`.
 *  - `~/.pi/agent/auth.json` — pi-side credential store written by
 *    Settings → Providers. Two entry shapes coexist there:
 *      * API-key:  `{ type, key }`
 *      * OAuth:    `{ type, access, refresh, expires, ... }`
 *
 * "Non-empty" = `typeof v === "string" && v.trim().length > 0`.
 * Empty strings, whitespace, null, undefined, and non-string values do
 * NOT count as configured.
 *
 * The detector NEVER throws; per-file parse failure is treated as "no
 * credential from that file" and falls through to the other file.
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
      if (v && typeof v === "object" && isNonEmptyString((v as Record<string, unknown>).apiKey)) {
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

/**
 * Returns true if at least one provider credential is configured in
 * either `~/.pi/agent/settings.json` or `~/.pi/agent/auth.json`.
 *
 * @param homeDir Override for the user's home directory. Defaults to
 *   `os.homedir()`. Pass a tmp dir in tests; never pass user-provided
 *   input — this path is read but not validated.
 */
export function hasAnyProviderCredential(homeDir: string = os.homedir()): boolean {
  const [settingsPath, authPath] = inspectedCredentialFiles(homeDir);
  if (settingsHasCredential(safeReadJson(settingsPath))) return true;
  if (authHasCredential(safeReadJson(authPath))) return true;
  return false;
}

/**
 * Absolute paths inspected by `hasAnyProviderCredential`, in inspection
 * order. Surfaced so Doctor's `detail` field can name the files without
 * duplicating the path logic.
 */
export function inspectedCredentialFiles(homeDir: string = os.homedir()): [string, string] {
  const agentDir = path.join(homeDir, ".pi", "agent");
  return [path.join(agentDir, "settings.json"), path.join(agentDir, "auth.json")];
}
