/**
 * Shared configuration module for PI Dashboard.
 * Used by both the server CLI and bridge extension.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const CONFIG_DIR = path.join(os.homedir(), ".pi", "dashboard");
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface DashboardConfig {
  port: number;
  piPort: number;
  autoStart: boolean;
  autoShutdown: boolean;
  shutdownIdleSeconds: number;
  tunnel: { enabled: boolean };
}

const DEFAULTS: DashboardConfig = {
  port: 8000,
  piPort: 9999,
  autoStart: true,
  autoShutdown: true,
  shutdownIdleSeconds: 300,
  tunnel: { enabled: true },
};

/**
 * Load configuration from ~/.pi/dashboard/config.json.
 * Returns defaults for missing fields, malformed JSON, or missing file.
 */
export function loadConfig(): DashboardConfig {
  const configDir = path.join(os.homedir(), ".pi", "dashboard");
  const configFile = path.join(configDir, "config.json");
  const defaults: DashboardConfig = { ...DEFAULTS };

  try {
    if (!fs.existsSync(configFile)) return defaults;
    const raw = fs.readFileSync(configFile, "utf-8");
    if (!raw.trim()) return defaults;
    const parsed = JSON.parse(raw);
    return {
      port: parsed.port ?? defaults.port,
      piPort: parsed.piPort ?? defaults.piPort,
      autoStart: parsed.autoStart ?? defaults.autoStart,
      autoShutdown: parsed.autoShutdown ?? defaults.autoShutdown,
      shutdownIdleSeconds: parsed.shutdownIdleSeconds ?? defaults.shutdownIdleSeconds,
      tunnel: {
        enabled: parsed.tunnel?.enabled ?? defaults.tunnel.enabled,
      },
    };
  } catch {
    return defaults;
  }
}

/**
 * Create ~/.pi/dashboard/config.json with defaults if it doesn't exist.
 * Creates the directory recursively if needed.
 */
export function ensureConfig(): void {
  const configDir = path.join(os.homedir(), ".pi", "dashboard");
  const configFile = path.join(configDir, "config.json");

  if (fs.existsSync(configFile)) return;

  fs.mkdirSync(configDir, { recursive: true });

  const defaults = {
    port: DEFAULTS.port,
    piPort: DEFAULTS.piPort,
    autoStart: DEFAULTS.autoStart,
    autoShutdown: DEFAULTS.autoShutdown,
    shutdownIdleSeconds: DEFAULTS.shutdownIdleSeconds,
    tunnel: DEFAULTS.tunnel,
  };

  fs.writeFileSync(configFile, JSON.stringify(defaults, null, 2) + "\n");
}
