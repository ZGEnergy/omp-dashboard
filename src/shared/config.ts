/**
 * Shared configuration module for PI Dashboard.
 * Used by both the server CLI and bridge extension.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const CONFIG_DIR = path.join(os.homedir(), ".pi", "dashboard");
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export type SpawnStrategy = "tmux" | "headless";

export interface AuthProviderConfig {
  clientId: string;
  clientSecret: string;
  issuerUrl?: string;
  name?: string;
}

export interface AuthConfig {
  secret: string;
  providers: Record<string, AuthProviderConfig>;
  allowedUsers?: string[];
  bypassUrls?: string[];
}

export interface DashboardConfig {
  port: number;
  piPort: number;
  autoStart: boolean;
  autoShutdown: boolean;
  shutdownIdleSeconds: number;
  spawnStrategy: SpawnStrategy;
  tunnel: { enabled: boolean; reservedToken?: string };
  devBuildOnReload: boolean;
  auth?: AuthConfig;
}

const VALID_SPAWN_STRATEGIES: SpawnStrategy[] = ["tmux", "headless"];

const DEFAULTS: DashboardConfig = {
  port: 8000,
  piPort: 9999,
  autoStart: true,
  autoShutdown: true,
  shutdownIdleSeconds: 300,
  spawnStrategy: "headless",
  tunnel: { enabled: true },
  devBuildOnReload: false,
};

/**
 * Parse and validate the auth config section.
 * Returns undefined if auth is not configured or has no providers.
 */
function parseAuthConfig(raw: any): AuthConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const providers = raw.providers;
  if (!providers || typeof providers !== "object" || Object.keys(providers).length === 0) {
    return undefined;
  }
  // Validate each provider has at least clientId and clientSecret
  const validProviders: Record<string, AuthProviderConfig> = {};
  for (const [key, value] of Object.entries(providers)) {
    const p = value as any;
    if (p && typeof p === "object" && p.clientId && p.clientSecret) {
      validProviders[key] = {
        clientId: p.clientId,
        clientSecret: p.clientSecret,
        ...(p.issuerUrl ? { issuerUrl: p.issuerUrl } : {}),
        ...(p.name ? { name: p.name } : {}),
      };
    }
  }
  if (Object.keys(validProviders).length === 0) return undefined;
  return {
    secret: raw.secret ?? "",
    providers: validProviders,
    ...(Array.isArray(raw.allowedUsers) ? { allowedUsers: raw.allowedUsers } : Array.isArray(raw.allowedEmails) ? { allowedUsers: raw.allowedEmails } : {}),
    bypassUrls: Array.isArray(raw.bypassUrls) ? raw.bypassUrls.filter((u: unknown) => typeof u === "string") : [],
  };
}

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
    const rawStrategy = parsed.spawnStrategy;
    const spawnStrategy: SpawnStrategy =
      VALID_SPAWN_STRATEGIES.includes(rawStrategy) ? rawStrategy : defaults.spawnStrategy;

    return {
      port: parsed.port ?? defaults.port,
      piPort: parsed.piPort ?? defaults.piPort,
      autoStart: parsed.autoStart ?? defaults.autoStart,
      autoShutdown: parsed.autoShutdown ?? defaults.autoShutdown,
      shutdownIdleSeconds: parsed.shutdownIdleSeconds ?? defaults.shutdownIdleSeconds,
      spawnStrategy,
      tunnel: {
        enabled: parsed.tunnel?.enabled ?? defaults.tunnel.enabled,
        ...(parsed.tunnel?.reservedToken ? { reservedToken: parsed.tunnel.reservedToken } : {}),
      },
      devBuildOnReload: parsed.devBuildOnReload ?? defaults.devBuildOnReload,
      auth: parseAuthConfig(parsed.auth),
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
    spawnStrategy: DEFAULTS.spawnStrategy,
    tunnel: DEFAULTS.tunnel,
    devBuildOnReload: DEFAULTS.devBuildOnReload,
  };

  fs.writeFileSync(configFile, JSON.stringify(defaults, null, 2) + "\n");
}
