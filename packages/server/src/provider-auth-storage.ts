/**
 * Read/write ~/.pi/agent/auth.json for pi provider credentials.
 * Uses lockfile + atomic write to avoid race conditions with running pi sessions.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ProviderAuthStatus } from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";

// ── Constants ────────────────────────────────────────────────────────────────

const AUTH_DIR = path.join(os.homedir(), ".pi", "agent");
const AUTH_PATH = path.join(AUTH_DIR, "auth.json");
const LOCK_PATH = AUTH_PATH + ".lock";
const LOCK_STALE_MS = 10_000;
const LOCK_RETRY_MS = 50;
const LOCK_MAX_RETRIES = 40; // 40 × 50ms = 2s max wait

export type ApiKeyCredential = { type: "api_key"; key: string };
export type OAuthCredential = { type: "oauth"; refresh: string; access: string; expires: number; [k: string]: unknown };
export type AuthCredential = ApiKeyCredential | OAuthCredential;
export type AuthData = Record<string, AuthCredential>;

// ── OAuth provider metadata (for status display) ────────────────────────────

interface OAuthProviderMeta {
  id: string;
  name: string;
  flowType: "auth_code" | "device_code";
}

const OAUTH_PROVIDERS: OAuthProviderMeta[] = [
  { id: "anthropic", name: "Anthropic (Claude Pro/Max)", flowType: "auth_code" },
  { id: "openai-codex", name: "ChatGPT Plus/Pro (Codex)", flowType: "auth_code" },
  { id: "github-copilot", name: "GitHub Copilot", flowType: "device_code" },
  { id: "google-gemini-cli", name: "Google Gemini CLI", flowType: "auth_code" },
  { id: "google-antigravity", name: "Antigravity", flowType: "auth_code" },
];

const API_KEY_PROVIDERS = [
  { id: "anthropic-api", authJsonKey: "anthropic", name: "Anthropic (API Key)" },
  { id: "openai", authJsonKey: "openai", name: "OpenAI" },
  { id: "google", authJsonKey: "google", name: "Google Gemini (API Key)" },
  { id: "mistral", authJsonKey: "mistral", name: "Mistral" },
  { id: "groq", authJsonKey: "groq", name: "Groq" },
  { id: "xai", authJsonKey: "xai", name: "xAI" },
  { id: "openrouter", authJsonKey: "openrouter", name: "OpenRouter" },
  { id: "zai", authJsonKey: "zai", name: "Z.ai" },
];

// ── Lock helpers ─────────────────────────────────────────────────────────────

function acquireLock(): void {
  // Ensure parent directory exists (fresh install may not have ~/.pi/agent/)
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
    try {
      fs.mkdirSync(LOCK_PATH, { recursive: false });
      return;
    } catch (err: any) {
      if (err.code === "EEXIST") {
        // Check for stale lock
        try {
          const stat = fs.statSync(LOCK_PATH);
          if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
            fs.rmdirSync(LOCK_PATH);
            continue;
          }
        } catch { /* stat failed, retry */ }
        // Wait and retry
        const waitMs = LOCK_RETRY_MS + Math.random() * LOCK_RETRY_MS;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to acquire auth.json lock after retries");
}

function releaseLock(): void {
  try { fs.rmdirSync(LOCK_PATH); } catch { /* ignore */ }
}

// ── File operations ──────────────────────────────────────────────────────────

function ensureDir(): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

export function readAuthJson(): AuthData {
  try {
    const raw = fs.readFileSync(AUTH_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err: any) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

function writeAuthJson(data: AuthData): void {
  ensureDir();
  const tmp = AUTH_PATH + ".tmp";
  const content = JSON.stringify(data, null, 2) + "\n";

  // Preserve existing permissions or use 0600 for new file
  let mode = 0o600;
  try {
    const stat = fs.statSync(AUTH_PATH);
    mode = stat.mode & 0o777;
  } catch { /* file doesn't exist yet */ }

  fs.writeFileSync(tmp, content, { mode });
  fs.renameSync(tmp, AUTH_PATH);
}

// ── Public API ───────────────────────────────────────────────────────────────

export function writeCredential(provider: string, credential: AuthCredential): void {
  acquireLock();
  try {
    const data = readAuthJson();
    data[provider] = credential;
    writeAuthJson(data);
  } finally {
    releaseLock();
  }
}

export function removeCredential(provider: string): void {
  acquireLock();
  try {
    const data = readAuthJson();
    delete data[provider];
    writeAuthJson(data);
  } finally {
    releaseLock();
  }
}

export function getAuthStatus(): ProviderAuthStatus[] {
  const data = readAuthJson();
  const statuses: ProviderAuthStatus[] = [];

  // OAuth providers
  for (const p of OAUTH_PROVIDERS) {
    const cred = data[p.id];
    if (cred && cred.type === "oauth") {
      statuses.push({
        id: p.id,
        name: p.name,
        flowType: p.flowType,
        authenticated: true,
        expires: (cred as OAuthCredential).expires,
      });
    } else {
      statuses.push({
        id: p.id,
        name: p.name,
        flowType: p.flowType,
        authenticated: false,
      });
    }
  }

  // API key providers (skip if the same key is already shown as OAuth)
  for (const p of API_KEY_PROVIDERS) {
    const cred = data[p.authJsonKey];
    // If key is already listed as OAuth provider (e.g., "anthropic"), skip the API key variant
    if (OAUTH_PROVIDERS.some((op) => op.id === p.authJsonKey) && cred?.type === "oauth") continue;
    const hasKey = !!(cred && cred.type === "api_key" && (cred as ApiKeyCredential).key);
    const entry: ProviderAuthStatus = {
      id: p.id,
      name: p.name,
      flowType: "api_key",
      authenticated: hasKey,
    };
    if (hasKey) {
      const key = (cred as ApiKeyCredential).key;
      entry.maskedKey = key.length >= 12 ? `${key.slice(0, 5)}...${key.slice(-3)}` : "****";
    }
    statuses.push(entry);
  }

  return statuses;
}

export function getOAuthProvidersMeta(): OAuthProviderMeta[] {
  return OAUTH_PROVIDERS;
}

/**
 * Resolve a UI provider ID to the auth.json key.
 * API key providers have an `authJsonKey` mapping (e.g., "anthropic-api" → "anthropic").
 * OAuth providers and unknown IDs pass through unchanged.
 */
export function resolveAuthJsonKey(providerId: string): string {
  const apiKeyProvider = API_KEY_PROVIDERS.find(p => p.id === providerId);
  return apiKeyProvider?.authJsonKey ?? providerId;
}
