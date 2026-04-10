/**
 * Config REST API helpers: read, write, redact secrets, runtime reload.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig, type DashboardConfig, type AuthConfig } from "@blackbelt-technology/pi-dashboard-shared/config.js";

const REDACTED = "***";

/**
 * Return the current config with secrets redacted.
 */
function getConfigPaths() {
  const dir = path.join(os.homedir(), ".pi", "dashboard");
  return { dir, file: path.join(dir, "config.json") };
}

export function readConfigRedacted(): DashboardConfig {
  const config = loadConfig();
  if (config.auth) {
    config.auth = redactAuthSecrets(config.auth);
  }
  return config;
}

function redactAuthSecrets(auth: AuthConfig): AuthConfig {
  const redacted: AuthConfig = {
    ...auth,
    secret: auth.secret ? REDACTED : "",
    providers: {},
  };
  for (const [key, provider] of Object.entries(auth.providers)) {
    redacted.providers[key] = {
      ...provider,
      clientSecret: REDACTED,
    };
  }
  return redacted;
}

/**
 * Fields that require a server restart to take effect.
 */
const RESTART_FIELDS = new Set(["port", "piPort"]);

export interface WriteConfigResult {
  success: boolean;
  restartRequired: boolean;
  error?: string;
}

/**
 * Merge partial config into existing, preserving redacted secrets, write to disk.
 * Returns whether a restart is needed.
 */
export function writeConfigPartial(partial: Record<string, any>): WriteConfigResult {
  const { dir, file } = getConfigPaths();
  try {
    // Read raw file to preserve unknown fields
    let existing: Record<string, any> = {};
    try {
      const raw = fs.readFileSync(file, "utf-8");
      existing = JSON.parse(raw);
    } catch { /* start fresh */ }

    // Check if restart-requiring fields changed
    let restartRequired = false;
    for (const field of RESTART_FIELDS) {
      if (field in partial && partial[field] !== existing[field]) {
        restartRequired = true;
      }
    }

    // Deep merge auth section, preserving redacted secrets
    if (partial.auth) {
      const existingAuth = existing.auth || {};
      const mergedAuth: any = { ...existingAuth };

      // Preserve secret if redacted
      if (partial.auth.secret === REDACTED || !partial.auth.secret) {
        mergedAuth.secret = existingAuth.secret;
      } else {
        mergedAuth.secret = partial.auth.secret;
      }

      // Merge providers, preserving redacted clientSecrets
      if (partial.auth.providers) {
        mergedAuth.providers = { ...existingAuth.providers };
        for (const [key, provider] of Object.entries(partial.auth.providers) as [string, any][]) {
          const existingProvider = existingAuth.providers?.[key] || {};
          mergedAuth.providers[key] = { ...existingProvider, ...provider };
          if (provider.clientSecret === REDACTED) {
            mergedAuth.providers[key].clientSecret = existingProvider.clientSecret || "";
          }
        }
      }

      if (partial.auth.allowedUsers !== undefined) {
        mergedAuth.allowedUsers = partial.auth.allowedUsers;
      }

      partial.auth = mergedAuth;
    }

    // Merge tunnel sub-object
    if (partial.tunnel) {
      partial.tunnel = { ...existing.tunnel, ...partial.tunnel };
    }

    // Merge memoryLimits sub-object
    if (partial.memoryLimits) {
      partial.memoryLimits = { ...existing.memoryLimits, ...partial.memoryLimits };
      restartRequired = true;
    }

    const merged = { ...existing, ...partial };

    // Remove computed fields that shouldn't be persisted
    delete merged.resolvedTrustedNetworks;

    // Write
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n");

    return { success: true, restartRequired };
  } catch (err: any) {
    return { success: false, restartRequired: false, error: err.message };
  }
}
