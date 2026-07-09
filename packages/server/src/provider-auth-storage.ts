/**
 * Read/write provider credentials from current OMP storage.
 *
 * Primary source: ~/.omp/agent/agent.db auth_credentials table.
 * Legacy fallback: ~/.omp/agent/auth.json.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
const _lockfile = _require("proper-lockfile") as typeof import("proper-lockfile");
import type { ProviderAuthStatus } from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";
import type { ProviderInfo } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { getAllHandlers, type ProviderHandler } from "./provider-auth-handlers.js";
import { getLatestCatalogue } from "./provider-catalogue-cache.js";

// ── Constants ────────────────────────────────────────────────────────────────

const AUTH_DIR = path.join(os.homedir(), ".omp", "agent");
const AUTH_PATH = path.join(AUTH_DIR, "auth.json");
const AGENT_DB_PATH = path.join(AUTH_DIR, "agent.db");
const AUTH_SCHEMA_VERSION = 4;
const SQLITE_NOW_EPOCH = "CAST(strftime('%s','now') AS INTEGER)";

export type ApiKeyCredential = { type: "api_key"; key: string };
export type OAuthCredential = { type: "oauth"; refresh: string; access: string; expires: number; [k: string]: unknown };
export type AuthCredential = ApiKeyCredential | OAuthCredential;
export type AuthData = Record<string, AuthCredential>;
export type AuthCredentialSource = "database" | "legacy-file";
export interface AuthSnapshotEntry {
  credential: AuthCredential;
  source: AuthCredentialSource;
}
export type AuthSnapshot = Record<string, AuthSnapshotEntry>;

interface OAuthProviderMeta {
  id: string;
  name: string;
  flowType: "auth_code" | "device_code";
}

interface AgentDbAuthRow {
  id: number;
  provider: string;
  credential_type: string;
  data: string;
}

const KNOWN_PROVIDER_META: Record<string, { displayName: string; envVar?: string }> = {
  "alibaba-coding-plan": { displayName: "Alibaba Coding Plan", envVar: "ALIBABA_CODING_PLAN_API_KEY" },
  anthropic: { displayName: "Anthropic", envVar: "ANTHROPIC_API_KEY" },
  cerebras: { displayName: "Cerebras", envVar: "CEREBRAS_API_KEY" },
  deepseek: { displayName: "DeepSeek", envVar: "DEEPSEEK_API_KEY" },
  fireworks: { displayName: "Fireworks", envVar: "FIREWORKS_API_KEY" },
  google: { displayName: "Google AI Studio" },
  "google-vertex": { displayName: "Google Vertex AI" },
  groq: { displayName: "Groq", envVar: "GROQ_API_KEY" },
  mistral: { displayName: "Mistral", envVar: "MISTRAL_API_KEY" },
  openai: { displayName: "OpenAI", envVar: "OPENAI_API_KEY" },
  openrouter: { displayName: "OpenRouter", envVar: "OPENROUTER_API_KEY" },
  vllm: { displayName: "vLLM", envVar: "VLLM_API_KEY" },
  xai: { displayName: "xAI", envVar: "XAI_API_KEY" },
  xiaomi: { displayName: "Xiaomi", envVar: "XIAOMI_API_KEY" },
  zai: { displayName: "zAI", envVar: "ZAI_API_KEY" },
};

// ── node:sqlite (dynamically required for compat) ────────────────────────────

type DatabaseSyncCtor = typeof import("node:sqlite").DatabaseSync;
type DatabaseSyncInstance = InstanceType<DatabaseSyncCtor>;

function loadDatabaseSync(): DatabaseSyncCtor | null {
  try {
    const sqlite = _require("node:sqlite") as { DatabaseSync?: DatabaseSyncCtor };
    return sqlite.DatabaseSync ?? null;
  } catch {
    return null;
  }
}

// ── Lock helpers (proper-lockfile) ───────────────────────────────────────────

function withLock<T>(fn: () => T): T {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  if (!fs.existsSync(AUTH_PATH)) {
    try { fs.writeFileSync(AUTH_PATH, "{}\n", { flag: "wx" }); } catch { /* race-safe */ }
  }

  const release = _lockfile.lockSync(AUTH_PATH, {
    stale: 10_000,
    realpath: false,
  });
  try {
    return fn();
  } finally {
    try { release(); } catch { /* ignore cleanup errors */ }
  }
}

// ── Legacy auth.json I/O ─────────────────────────────────────────────────────

function readLegacyAuthJson(swallowErrors = false): AuthData {
  try {
    const raw = fs.readFileSync(AUTH_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as AuthData
      : {};
  } catch (err: unknown) {
    const code = typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: unknown }).code
      : undefined;
    if (code === "ENOENT") return {};
    if (swallowErrors) return {};
    throw err;
  }
}

function writeLegacyAuthJson(data: AuthData): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const tmp = AUTH_PATH + ".tmp";
  const content = JSON.stringify(data, null, 2) + "\n";

  let mode = 0o600;
  try {
    const stat = fs.statSync(AUTH_PATH);
    mode = stat.mode & 0o777;
  } catch { /* file doesn't exist yet */ }

  fs.writeFileSync(tmp, content, { mode });
  fs.renameSync(tmp, AUTH_PATH);
}

function removeLegacyCredentialBestEffort(provider: string): void {
  try {
    withLock(() => {
      const data = readLegacyAuthJson(true);
      if (!(provider in data)) return;
      delete data[provider];
      writeLegacyAuthJson(data);
    });
  } catch {
    // Database-backed installs no longer depend on auth.json.
  }
}

// ── agent.db I/O ─────────────────────────────────────────────────────────────

function agentDbExists(): boolean {
  return fs.existsSync(AGENT_DB_PATH);
}

function initializeAgentDbSchema(db: DatabaseSyncInstance): void {
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS auth_schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      credential_type TEXT NOT NULL,
      data TEXT NOT NULL,
      disabled_cause TEXT DEFAULT NULL,
      identity_key TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL DEFAULT (${SQLITE_NOW_EPOCH}),
      updated_at INTEGER NOT NULL DEFAULT (${SQLITE_NOW_EPOCH})
    );
    CREATE INDEX IF NOT EXISTS idx_auth_provider ON auth_credentials(provider);
    CREATE INDEX IF NOT EXISTS idx_auth_provider_identity
      ON auth_credentials(provider, identity_key)
      WHERE identity_key IS NOT NULL;
  `);
  db.prepare("INSERT OR REPLACE INTO auth_schema_version(id, version) VALUES (1, ?)").run(AUTH_SCHEMA_VERSION);
}

function deserializeAgentDbCredential(row: AgentDbAuthRow): AuthCredential | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const data = parsed as Record<string, unknown>;
  if (row.credential_type === "api_key") {
    return typeof data.key === "string"
      ? { type: "api_key", key: data.key }
      : null;
  }
  if (row.credential_type === "oauth") {
    return { type: "oauth", ...(data as Record<string, unknown>) } as OAuthCredential;
  }
  return null;
}

function serializeAgentDbCredential(credential: AuthCredential): { credentialType: AuthCredential["type"]; data: string } {
  if (credential.type === "api_key") {
    return {
      credentialType: "api_key",
      data: JSON.stringify({ key: credential.key }),
    };
  }
  const { type: _type, ...rest } = credential;
  return {
    credentialType: "oauth",
    data: JSON.stringify(rest),
  };
}

function readAgentDbSnapshot(): AuthSnapshot | null {
  if (!agentDbExists()) return null;
  const DatabaseSync = loadDatabaseSync();
  if (!DatabaseSync) return null;
  let db: DatabaseSyncInstance | null = null;
  try {
    db = new DatabaseSync(AGENT_DB_PATH);
    const table = db
      .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'auth_credentials'")
      .get() as { present?: number } | undefined;
    if (table?.present !== 1) return null;

    const rows = db.prepare(`
      SELECT id, provider, credential_type, data
      FROM auth_credentials
      WHERE disabled_cause IS NULL
      ORDER BY id ASC
    `).all() as unknown as AgentDbAuthRow[]; // node:sqlite exposes generic row records.

    const snapshot: AuthSnapshot = {};
    for (const row of rows) {
      if (snapshot[row.provider]) continue;
      const credential = deserializeAgentDbCredential(row);
      if (!credential) continue;
      snapshot[row.provider] = {
        credential,
        source: "database",
      };
    }
    return snapshot;
  } catch {
    return null;
  } finally {
    try { db?.close(); } catch { /* ignore close errors */ }
  }
}

function writeAgentDbCredential(provider: string, credential: AuthCredential): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const DatabaseSync = loadDatabaseSync();
  if (!DatabaseSync) throw new Error("node:sqlite is not available in this runtime");
  const db = new DatabaseSync(AGENT_DB_PATH);
  try {
    initializeAgentDbSchema(db);
    const serialized = serializeAgentDbCredential(credential);
    const existing = db.prepare(`
      SELECT id
      FROM auth_credentials
      WHERE provider = ? AND credential_type = ? AND disabled_cause IS NULL
      ORDER BY id ASC
      LIMIT 1
    `).get(provider, serialized.credentialType) as { id?: number } | undefined;

    if (typeof existing?.id === "number") {
      db.prepare(`
        UPDATE auth_credentials
        SET data = ?, disabled_cause = NULL, updated_at = ${SQLITE_NOW_EPOCH}
        WHERE id = ?
      `).run(serialized.data, existing.id);
      db.prepare(`
        UPDATE auth_credentials
        SET disabled_cause = ?, updated_at = ${SQLITE_NOW_EPOCH}
        WHERE provider = ? AND credential_type = ? AND disabled_cause IS NULL AND id != ?
      `).run("replaced by dashboard", provider, serialized.credentialType, existing.id);
      return;
    }

    db.prepare(`
      INSERT INTO auth_credentials (provider, credential_type, data, identity_key, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ${SQLITE_NOW_EPOCH}, ${SQLITE_NOW_EPOCH})
    `).run(provider, serialized.credentialType, serialized.data);
  } finally {
    db.close();
  }
}

function removeAgentDbCredential(provider: string, credentialType?: AuthCredential["type"]): void {
  const DatabaseSync = loadDatabaseSync();
  if (!DatabaseSync) throw new Error("node:sqlite is not available in this runtime");
  const db = new DatabaseSync(AGENT_DB_PATH);
  try {
    initializeAgentDbSchema(db);
    if (credentialType) {
      db.prepare(`
        UPDATE auth_credentials
        SET disabled_cause = ?, updated_at = ${SQLITE_NOW_EPOCH}
        WHERE provider = ? AND credential_type = ? AND disabled_cause IS NULL
      `).run("removed by dashboard", provider, credentialType);
      return;
    }

    db.prepare(`
      UPDATE auth_credentials
      SET disabled_cause = ?, updated_at = ${SQLITE_NOW_EPOCH}
      WHERE provider = ? AND disabled_cause IS NULL
    `).run("removed by dashboard", provider);
  } finally {
    db.close();
  }
}

function authDataFromSnapshot(snapshot: AuthSnapshot): AuthData {
  const data: AuthData = {};
  for (const [provider, entry] of Object.entries(snapshot)) {
    data[provider] = entry.credential;
  }
  return data;
}

export function readAuthSnapshot(): AuthSnapshot {
  const legacy = readLegacyAuthJson(agentDbExists());
  const snapshot: AuthSnapshot = {};
  for (const [provider, credential] of Object.entries(legacy)) {
    snapshot[provider] = {
      credential,
      source: "legacy-file",
    };
  }

  const agentDb = readAgentDbSnapshot();
  if (agentDb) {
    for (const [provider, entry] of Object.entries(agentDb)) {
      snapshot[provider] = entry;
    }
  }
  return snapshot;
}

export function readAuthJson(): AuthData {
  return authDataFromSnapshot(readAuthSnapshot());
}

function fallbackDisplayName(provider: string): string {
  const meta = KNOWN_PROVIDER_META[provider];
  if (meta) return meta.displayName;
  return provider
    .split("-")
    .map((part) => part.length <= 3
      ? part.toUpperCase()
      : part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function augmentCatalogueWithStoredProviders(
  catalogue: ProviderInfo[],
  snapshot: AuthSnapshot,
  oauthHandlers: ProviderHandler[],
): ProviderInfo[] {
  const knownIds = new Set(catalogue.map((entry) => entry.id));
  const oauthIds = new Set(oauthHandlers.map((handler) => handler.providerId));
  const augmented = [...catalogue];

  for (const [provider, entry] of Object.entries(snapshot)) {
    if (knownIds.has(provider)) continue;
    if (oauthIds.has(provider) && entry.credential.type !== "api_key") continue;
    const meta = KNOWN_PROVIDER_META[provider];
    augmented.push({
      id: provider,
      displayName: fallbackDisplayName(provider),
      hasOAuth: oauthIds.has(provider),
      configured: true,
      source: "stored",
      ...(meta?.envVar ? { envVar: meta.envVar } : {}),
    });
    knownIds.add(provider);
  }

  return augmented;
}

function getRuntimeCredentialSource(entry: ProviderInfo | undefined): ProviderAuthStatus["source"] | undefined {
  if (entry?.ambient) return "ambient";
  if (entry?.source === "environment") return "environment";
  return undefined;
}

function attachStatusSources(
  statuses: ProviderAuthStatus[],
  catalogue: ProviderInfo[],
  snapshot: AuthSnapshot,
): ProviderAuthStatus[] {
  const catalogueById = new Map(catalogue.map((entry) => [entry.id, entry]));
  return statuses.map((status) => {
    const providerId = resolveAuthJsonKey(status.id);
    const source = snapshot[providerId]?.source ?? getRuntimeCredentialSource(catalogueById.get(providerId));
    return source ? { ...status, source } : status;
  });
}

// ── Public API: write/remove ─────────────────────────────────────────────────

export function writeCredential(provider: string, credential: AuthCredential): void {
  if (agentDbExists()) {
    writeAgentDbCredential(provider, credential);
    removeLegacyCredentialBestEffort(provider);
    return;
  }

  withLock(() => {
    const data = readLegacyAuthJson();
    data[provider] = credential;
    writeLegacyAuthJson(data);
  });
}

export function removeCredential(provider: string, credentialType?: AuthCredential["type"]): void {
  if (agentDbExists()) {
    removeAgentDbCredential(provider, credentialType);
    removeLegacyCredentialBestEffort(provider);
    return;
  }

  withLock(() => {
    const data = readLegacyAuthJson();
    const existing = data[provider];
    if (!existing) return;
    if (credentialType && existing.type !== credentialType) return;
    delete data[provider];
    writeLegacyAuthJson(data);
  });
}

// ── Pure status builder (testable) ───────────────────────────────────────────

/**
 * Pure derivation of `ProviderAuthStatus[]` from stored auth data, the
 * bridge-pushed provider catalogue, and the local OAuth handler set.
 * No I/O. See change: replace-hardcoded-provider-lists.
 */
export function _buildAuthStatus(
  catalogue: ProviderInfo[],
  authData: AuthData,
  oauthHandlers: ProviderHandler[],
): ProviderAuthStatus[] {
  const statuses: ProviderAuthStatus[] = [];
  const oauthIds = new Set(oauthHandlers.map((h) => h.providerId));

  // OAuth rows from local handler registry.
  for (const h of oauthHandlers) {
    const cred = authData[h.providerId];
    if (cred && cred.type === "oauth") {
      statuses.push({
        id: h.providerId,
        name: h.displayName,
        flowType: h.flowType,
        authenticated: true,
        expires: (cred as OAuthCredential).expires,
      });
    } else {
      statuses.push({
        id: h.providerId,
        name: h.displayName,
        flowType: h.flowType,
        authenticated: false,
      });
    }
  }

  // API-key rows from bridge-pushed catalogue.
  // Skip custom providers (registered via pi.registerProvider() from
  // ~/.omp/agent/providers.json) — those are managed by the dedicated
  // LLM Providers settings section. OAuth rows for custom providers
  // were already emitted above when the OAuth handler registry has
  // a matching id.
  for (const entry of catalogue) {
    if (entry.custom) continue;
    const hasOAuthCollision = oauthIds.has(entry.id);
    const uiId = hasOAuthCollision ? `${entry.id}-api` : entry.id;
    const displayName = hasOAuthCollision
      ? `${entry.displayName} (API Key)`
      : entry.displayName;
    const authJsonKey = entry.id;
    const cred = authData[authJsonKey];
    const hasStoredKey = !!(cred && cred.type === "api_key" && (cred as ApiKeyCredential).key);

    const row: ProviderAuthStatus = {
      id: uiId,
      name: displayName,
      flowType: "api_key",
      authenticated: hasStoredKey || !!entry.ambient,
    };
    if (hasStoredKey) {
      const key = (cred as ApiKeyCredential).key;
      row.maskedKey = key.length >= 12 ? `${key.slice(0, 5)}...${key.slice(-3)}` : "****";
    } else if (entry.ambient) {
      row.maskedKey = "(ambient)";
    }
    if (entry.envVar) row.envVar = entry.envVar;
    if (entry.ambient) row.ambient = true;
    statuses.push(row);
  }

  return statuses;
}

// ── Public API: status / OAuth meta / id resolution ─────────────────────────

export function getAuthStatus(): ProviderAuthStatus[] {
  const oauthHandlers = getAllHandlers();
  const snapshot = readAuthSnapshot();
  const catalogue = augmentCatalogueWithStoredProviders(getLatestCatalogue(), snapshot, oauthHandlers);
  const authData = authDataFromSnapshot(snapshot);
  return attachStatusSources(_buildAuthStatus(catalogue, authData, oauthHandlers), catalogue, snapshot);
}

export function getOAuthProvidersMeta(): OAuthProviderMeta[] {
  return getAllHandlers().map((h) => ({
    id: h.providerId,
    name: h.displayName,
    flowType: h.flowType,
  }));
}

/**
 * Resolve a UI provider ID to the auth.json key.
 *
 * The catalogue encodes API-key rows with `<id>-api` suffix when an
 * OAuth handler exists for the same id. This unwraps the suffix back
 * to the underlying auth.json key. OAuth ids pass through unchanged
 * (their UI id == their auth.json key). Unknown ids pass through too,
 * matching the previous behavior.
 */

export function resolveCredentialType(providerId: string): AuthCredential["type"] | undefined {
  const oauthIds = new Set(getAllHandlers().map((h) => h.providerId));
  if (providerId.endsWith("-api")) {
    const bare = providerId.slice(0, -"-api".length);
    if (oauthIds.has(bare)) return "api_key";
  }
  if (oauthIds.has(providerId)) return "oauth";
  return undefined;
}

export function resolveAuthJsonKey(providerId: string): string {
  const oauthIds = new Set(getAllHandlers().map((h) => h.providerId));
  // <id>-api suffix → strip suffix iff the bare id is an OAuth handler.
  if (providerId.endsWith("-api")) {
    const bare = providerId.slice(0, -"-api".length);
    if (oauthIds.has(bare)) return bare;
  }
  return providerId;
}
