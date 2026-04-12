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
  bypassHosts?: string[];
}

export interface MemoryLimitsConfig {
  /** Max events stored per session (0 = unlimited). Default: 200 */
  maxEventsPerSession: number;
  /** Max chars before truncating string fields in events (0 = no truncation). Default: 0 (disabled) */
  maxStringFieldSize: number;
  /** Max bytes in browser WebSocket send buffer before dropping messages (0 = no limit). Default: 4194304 (4MB) */
  maxWsBufferBytes: number;
}

export const DEFAULT_MEMORY_LIMITS: MemoryLimitsConfig = {
  maxEventsPerSession: 5000,
  maxStringFieldSize: 0,
  maxWsBufferBytes: 4 * 1024 * 1024,
};

export interface EditorConfig {
  /** Override path to code-server binary */
  binary?: string;
  /** Minutes before idle instance is killed (default: 10) */
  idleTimeoutMinutes: number;
  /** Maximum concurrent code-server instances (default: 3) */
  maxInstances: number;
}

export const DEFAULT_EDITOR_CONFIG: EditorConfig = {
  idleTimeoutMinutes: 10,
  maxInstances: 3,
};

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
  defaultModel: string;
  memoryLimits: MemoryLimitsConfig;
  editor: EditorConfig;
  /** Networks trusted for full access without authentication (CIDR, wildcard, exact IP) */
  trustedNetworks: string[];
  /** Merged trustedNetworks + auth.bypassHosts (deduplicated). Computed at load time. */
  resolvedTrustedNetworks: string[];
  /** CORS allowed origins for cross-origin client hosting */
  cors: CorsConfig;
  /** Last-used server address (host:port) for reconnection */
  lastServer?: string;
  /** Whether the server was launched by the Electron app */
  electronMode: boolean;
}

export interface CorsConfig {
  /** Additional origins allowed for cross-origin requests */
  allowedOrigins: string[];
}

const VALID_SPAWN_STRATEGIES: SpawnStrategy[] = ["tmux", "headless"];

const DEFAULTS: DashboardConfig = {
  port: 8000,
  piPort: 9999,
  autoStart: true,
  autoShutdown: false,
  shutdownIdleSeconds: 300,
  spawnStrategy: "headless",
  tunnel: { enabled: true },
  devBuildOnReload: false,
  defaultModel: "",
  memoryLimits: { ...DEFAULT_MEMORY_LIMITS },
  editor: { ...DEFAULT_EDITOR_CONFIG },
  trustedNetworks: [],
  resolvedTrustedNetworks: [],
  cors: { allowedOrigins: [] },
  electronMode: false,
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
    bypassHosts: Array.isArray(raw.bypassHosts) ? raw.bypassHosts.filter((u: unknown) => typeof u === "string") : [],
  };
}

function parseEditorConfig(raw: any): EditorConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_EDITOR_CONFIG };
  return {
    ...(typeof raw.binary === "string" ? { binary: raw.binary } : {}),
    idleTimeoutMinutes: typeof raw.idleTimeoutMinutes === "number" ? raw.idleTimeoutMinutes : DEFAULT_EDITOR_CONFIG.idleTimeoutMinutes,
    maxInstances: typeof raw.maxInstances === "number" ? raw.maxInstances : DEFAULT_EDITOR_CONFIG.maxInstances,
  };
}

function parseMemoryLimits(raw: any): MemoryLimitsConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_MEMORY_LIMITS };
  return {
    maxEventsPerSession: typeof raw.maxEventsPerSession === "number" ? raw.maxEventsPerSession : DEFAULT_MEMORY_LIMITS.maxEventsPerSession,
    maxStringFieldSize: typeof raw.maxStringFieldSize === "number" ? raw.maxStringFieldSize : DEFAULT_MEMORY_LIMITS.maxStringFieldSize,
    maxWsBufferBytes: typeof raw.maxWsBufferBytes === "number" ? raw.maxWsBufferBytes : DEFAULT_MEMORY_LIMITS.maxWsBufferBytes,
  };
}

function parseTrustedNetworks(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry: unknown) => typeof entry === "string" && entry.length > 0);
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

    const result: DashboardConfig = {
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
      defaultModel: typeof parsed.defaultModel === "string" ? parsed.defaultModel : defaults.defaultModel,
      auth: parseAuthConfig(parsed.auth),
      memoryLimits: parseMemoryLimits(parsed.memoryLimits),
      editor: parseEditorConfig(parsed.editor),
      trustedNetworks: parseTrustedNetworks(parsed.trustedNetworks),
      resolvedTrustedNetworks: [],
      cors: {
        allowedOrigins: Array.isArray(parsed.cors?.allowedOrigins)
          ? parsed.cors.allowedOrigins.filter((o: unknown) => typeof o === "string")
          : defaults.cors.allowedOrigins,
      },
      ...(typeof parsed.lastServer === "string" ? { lastServer: parsed.lastServer } : {}),
      electronMode: parsed.electronMode === true,
    };

    // Compute resolvedTrustedNetworks: merge trustedNetworks + auth.bypassHosts
    const merged = new Set(result.trustedNetworks);
    if (result.auth?.bypassHosts) {
      for (const h of result.auth.bypassHosts) merged.add(h);
    }
    result.resolvedTrustedNetworks = Array.from(merged);
    return result;
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
