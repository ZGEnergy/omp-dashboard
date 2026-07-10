/**
 * Read/write provider credentials for Oh My Pi.
 *
 * Primary store: `~/.omp/agent/agent.db` (`auth_credentials` table).
 * Legacy fallback: `~/.omp/agent/auth.json` when sqlite has no rows.
 *
 * Public surface preserved for routes/UI: writeCredential / removeCredential /
 * readAuthJson / getAuthStatus / resolveAuthJsonKey.
 *
 * See: docs/plans/omp-host-contract.md Phase 4.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import type { ProviderAuthStatus } from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";
import type { ProviderInfo } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import {
  getAgentDbPath,
  getAgentHome,
} from "@blackbelt-technology/pi-dashboard-shared/host-profile.js";
import { getAllHandlers, type ProviderHandler } from "./provider-auth-handlers.js";
import { getLatestCatalogue } from "./provider-catalogue-cache.js";

const _require = createRequire(import.meta.url);
const _lockfile = _require("proper-lockfile") as typeof import("proper-lockfile");

const AUTH_DIR = getAgentHome();
const AUTH_PATH = path.join(AUTH_DIR, "auth.json");
const AGENT_DB_PATH = getAgentDbPath();

export type ApiKeyCredential = { type: "api_key"; key: string };
export type OAuthCredential = {
  type: "oauth";
  refresh: string;
  access: string;
  expires: number;
  [k: string]: unknown;
};
export type AuthCredential = ApiKeyCredential | OAuthCredential;
export type AuthData = Record<string, AuthCredential>;

interface OAuthProviderMeta {
  id: string;
  name: string;
  flowType: "auth_code" | "device_code";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCredential(type: string, dataRaw: string): AuthCredential | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(dataRaw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  if (type === "api_key") {
    if (typeof parsed.key !== "string" || !parsed.key) return null;
    return { type: "api_key", key: parsed.key };
  }

  if (type === "oauth") {
    if (typeof parsed.refresh !== "string" || typeof parsed.access !== "string") {
      return null;
    }
    let expires = 0;
    if (typeof parsed.expires === "number") expires = parsed.expires;
    else if (typeof parsed.expires === "string") {
      const n = Number(parsed.expires);
      expires = Number.isFinite(n) ? n : 0;
    }
    const oauth: OAuthCredential = {
      type: "oauth",
      refresh: parsed.refresh,
      access: parsed.access,
      expires,
    };
    for (const [k, v] of Object.entries(parsed)) {
      if (k === "type" || k === "refresh" || k === "access" || k === "expires") continue;
      oauth[k] = v;
    }
    return oauth;
  }

  return null;
}

function openDb(): DatabaseSync {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const db = new DatabaseSync(AGENT_DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      credential_type TEXT NOT NULL,
      data TEXT NOT NULL,
      disabled_cause TEXT,
      identity_key TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_provider ON auth_credentials(provider);
  `);
  return db;
}

function ensureLockTarget(): string {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  if (fs.existsSync(AGENT_DB_PATH)) return AGENT_DB_PATH;
  if (!fs.existsSync(AUTH_PATH)) {
    try {
      fs.writeFileSync(AUTH_PATH, "{}\n", { flag: "wx" });
    } catch {
      /* race-safe */
    }
  }
  // Prefer creating the db so subsequent writes land in sqlite.
  try {
    openDb().close();
    return AGENT_DB_PATH;
  } catch {
    return AUTH_PATH;
  }
}

function withLock<T>(fn: () => T): T {
  const lockTarget = ensureLockTarget();
  const release = _lockfile.lockSync(lockTarget, {
    stale: 10_000,
    realpath: false,
  });
  try {
    return fn();
  } finally {
    try {
      release();
    } catch {
      /* ignore cleanup errors */
    }
  }
}

function readFromSqlite(): AuthData {
  if (!fs.existsSync(AGENT_DB_PATH)) return {};
  let db: DatabaseSync | undefined;
  try {
    db = openDb();
    const rowsUnknown = db
      .prepare(
        `SELECT provider, credential_type, data, disabled_cause
         FROM auth_credentials
         WHERE disabled_cause IS NULL
         ORDER BY id ASC`,
      )
      .all();
    const out: AuthData = {};
    if (!Array.isArray(rowsUnknown)) return out;
    for (const rowUnknown of rowsUnknown) {
      if (!isRecord(rowUnknown)) continue;
      const provider = rowUnknown.provider;
      const credentialType = rowUnknown.credential_type;
      const data = rowUnknown.data;
      if (typeof provider !== "string" || typeof credentialType !== "string") continue;
      if (typeof data !== "string") continue;
      if (out[provider]) continue;
      const cred = parseCredential(credentialType, data);
      if (cred) out[provider] = cred;
    }
    return out;
  } catch {
    return {};
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

function readFromAuthJsonFile(): AuthData {
  try {
    const raw = fs.readFileSync(AUTH_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const out: AuthData = {};
    for (const [provider, entry] of Object.entries(parsed)) {
      if (!isRecord(entry) || typeof entry.type !== "string") continue;
      const cred = parseCredential(entry.type, JSON.stringify(entry));
      if (cred) out[provider] = cred;
    }
    return out;
  } catch (err: unknown) {
    if (isRecord(err) && err.code === "ENOENT") return {};
    throw err;
  }
}

/** Snapshot of credentials keyed by provider (legacy auth.json shape). */
export function readAuthJson(): AuthData {
  const fromDb = readFromSqlite();
  if (Object.keys(fromDb).length > 0) return fromDb;
  return readFromAuthJsonFile();
}

function serializeCredentialData(credential: AuthCredential): string {
  if (credential.type === "api_key") {
    return JSON.stringify({ key: credential.key, source: "login" });
  }
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(credential)) {
    if (k === "type") continue;
    rest[k] = v;
  }
  return JSON.stringify(rest);
}

function writeCredentialToSqlite(provider: string, credential: AuthCredential): void {
  const db = openDb();
  try {
    const now = Date.now();
    const existingUnknown = db
      .prepare(
        `SELECT id FROM auth_credentials
         WHERE provider = ? AND credential_type = ? AND disabled_cause IS NULL
         ORDER BY id ASC LIMIT 1`,
      )
      .get(provider, credential.type);

    const data = serializeCredentialData(credential);
    let existingId: number | undefined;
    if (isRecord(existingUnknown) && typeof existingUnknown.id === "number") {
      existingId = existingUnknown.id;
    }

    if (existingId !== undefined) {
      db.prepare(
        `UPDATE auth_credentials
         SET data = ?, updated_at = ?, disabled_cause = NULL
         WHERE id = ?`,
      ).run(data, now, existingId);
    } else {
      db.prepare(
        `INSERT INTO auth_credentials
          (provider, credential_type, data, identity_key, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?)`,
      ).run(provider, credential.type, data, now, now);
    }
  } finally {
    db.close();
  }
}

function removeCredentialFromSqlite(provider: string): void {
  if (!fs.existsSync(AGENT_DB_PATH)) return;
  const db = openDb();
  try {
    db.prepare(`DELETE FROM auth_credentials WHERE provider = ?`).run(provider);
  } finally {
    db.close();
  }
}

function writeAuthJsonFile(data: AuthData): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const tmp = AUTH_PATH + ".tmp";
  const content = JSON.stringify(data, null, 2) + "\n";
  let mode = 0o600;
  try {
    const stat = fs.statSync(AUTH_PATH);
    mode = stat.mode & 0o777;
  } catch {
    /* new file */
  }
  fs.writeFileSync(tmp, content, { mode });
  fs.renameSync(tmp, AUTH_PATH);
}

export function writeCredential(provider: string, credential: AuthCredential): void {
  withLock(() => {
    writeCredentialToSqlite(provider, credential);
    if (fs.existsSync(AUTH_PATH)) {
      const data = readFromAuthJsonFile();
      data[provider] = credential;
      writeAuthJsonFile(data);
    }
  });
}

export function removeCredential(provider: string): void {
  withLock(() => {
    removeCredentialFromSqlite(provider);
    if (fs.existsSync(AUTH_PATH)) {
      const data = readFromAuthJsonFile();
      delete data[provider];
      writeAuthJsonFile(data);
    }
  });
}

/**
 * Pure derivation of `ProviderAuthStatus[]` from auth data, the
 * bridge-pushed provider catalogue, and the local OAuth handler set.
 */
export function _buildAuthStatus(
  catalogue: ProviderInfo[],
  authData: AuthData,
  oauthHandlers: ProviderHandler[],
): ProviderAuthStatus[] {
  const statuses: ProviderAuthStatus[] = [];
  const oauthIds = new Set(oauthHandlers.map((h) => h.providerId));

  for (const h of oauthHandlers) {
    const cred = authData[h.providerId];
    if (cred && cred.type === "oauth") {
      statuses.push({
        id: h.providerId,
        name: h.displayName,
        flowType: h.flowType,
        authenticated: true,
        expires: cred.expires,
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

  for (const entry of catalogue) {
    if (entry.custom) continue;
    const hasOAuthCollision = oauthIds.has(entry.id);
    const uiId = hasOAuthCollision ? `${entry.id}-api` : entry.id;
    const displayName = hasOAuthCollision
      ? `${entry.displayName} (API Key)`
      : entry.displayName;
    const cred = authData[entry.id];
    const hasStoredKey = !!(cred && cred.type === "api_key" && cred.key);

    const row: ProviderAuthStatus = {
      id: uiId,
      name: displayName,
      flowType: "api_key",
      authenticated: hasStoredKey || !!entry.ambient,
    };
    if (hasStoredKey && cred && cred.type === "api_key") {
      const key = cred.key;
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

export function getAuthStatus(): ProviderAuthStatus[] {
  return _buildAuthStatus(getLatestCatalogue(), readAuthJson(), getAllHandlers());
}

export function getOAuthProvidersMeta(): OAuthProviderMeta[] {
  return getAllHandlers().map((h) => ({
    id: h.providerId,
    name: h.displayName,
    flowType: h.flowType,
  }));
}

/**
 * Resolve a UI provider ID to the credential store key.
 * `<id>-api` suffix unwraps when the bare id is an OAuth handler.
 */
export function resolveAuthJsonKey(providerId: string): string {
  const oauthIds = new Set(getAllHandlers().map((h) => h.providerId));
  if (providerId.endsWith("-api")) {
    const bare = providerId.slice(0, -4);
    if (oauthIds.has(bare)) return bare;
  }
  return providerId;
}
