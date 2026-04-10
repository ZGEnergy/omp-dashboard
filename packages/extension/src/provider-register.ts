/**
 * Provider Extension (Dashboard)
 *
 * Registers custom LLM providers with auto-discovered models.
 * Config: ~/.pi/agent/providers.json (providers section only — preserves other fields)
 *
 * Providers are configured via the dashboard settings UI or by editing
 * ~/.pi/agent/providers.json directly. No TUI commands.
 *
 * Event API:
 *   flow:resolve-model / flow:get-available-models
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// -- Types ----------------------------------------------------------------

interface ProviderEntry {
  baseUrl: string;
  apiKey: string;
  api?: string;
}

// -- Config path ----------------------------------------------------------

const CONFIG_PATH = join(homedir(), ".pi", "agent", "providers.json");

// -- Config I/O (read-only — providers section) ----------------------------

function loadProviders(): Record<string, ProviderEntry> {
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      const providers: Record<string, ProviderEntry> = { ...raw.providers };
      for (const [, entry] of Object.entries(providers) as [string, any][]) {
        if (entry.apiKeyEnv && !entry.apiKey) {
          entry.apiKey = "$" + entry.apiKeyEnv;
          delete entry.apiKeyEnv;
        }
        delete (entry as any).modelIds;
      }
      return providers;
    } catch {
      // Fall through to empty
    }
  }
  return {};
}

// -- API key resolution ---------------------------------------------------

function resolveApiKey(apiKey: string): string | undefined {
  if (apiKey.startsWith("$")) {
    return process.env[apiKey.slice(1)];
  }
  return apiKey;
}

function resolveApiKeyEnvName(providerName: string, apiKey: string): string {
  if (apiKey.startsWith("$")) {
    return apiKey.slice(1);
  }
  const syntheticEnv = `JUDO_${providerName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_KEY`;
  process.env[syntheticEnv] = apiKey;
  return syntheticEnv;
}

function hasApiKey(_providerName: string, entry: ProviderEntry): boolean {
  if (entry.apiKey.startsWith("$")) {
    return !!process.env[entry.apiKey.slice(1)];
  }
  return true;
}

// -- Model discovery from /v1/models endpoint -----------------------------

interface DiscoveredModel {
  id: string;
  owned_by?: string;
}

async function discoverModels(baseUrl: string, apiKey: string): Promise<DiscoveredModel[]> {
  const resolved = resolveApiKey(apiKey);
  if (!resolved) return [];

  const url = baseUrl.endsWith("/") ? `${baseUrl}models` : `${baseUrl}/models`;

  try {
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${resolved}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(`[provider] Model discovery failed for ${url}: HTTP ${response.status}`);
      return [];
    }

    const body = await response.json() as any;
    if (!body?.data || !Array.isArray(body.data)) {
      console.warn(`[provider] Model discovery: unexpected response format from ${url}`);
      return [];
    }

    return body.data
      .filter((m: any) => m?.id && typeof m.id === "string")
      .map((m: any) => ({ id: m.id, owned_by: m.owned_by }));
  } catch (err: any) {
    console.warn(`[provider] Model discovery failed for ${url}: ${err.message}`);
    return [];
  }
}

// -- Mutable state --------------------------------------------------------

let currentSessionProvider = "";
let currentSessionModelId = "";

let piRef: ExtensionAPI | null = null;

// Callback for notifying the bridge when providers change
let onProvidersChanged: (() => void) | null = null;

export function getSessionInfo(): { provider: string; modelId: string } {
  return { provider: currentSessionProvider, modelId: currentSessionModelId };
}

export function getModelDisplayName(modelId: string): string {
  if (piRef) {
    const data: any = {};
    piRef.events.emit("flow:get-available-models", data);
    if (data.models && Array.isArray(data.models)) {
      const match = data.models.find((m: any) => m.id === modelId || `${m.provider}/${m.id}` === modelId);
      if (match?.name) return match.name;
    }
  }
  return modelId;
}

/** Register a callback for when providers change (used by bridge for models_list push). */
export function onProviderChanged(callback: () => void): void {
  onProvidersChanged = callback;
}

// -- Helper: get modelRegistry via event ----------------------------------

function getModelRegistry(): any {
  if (!piRef) return null;
  const spawnCtx: any = {};
  piRef.events.emit("flow:get-spawn-context", spawnCtx);
  return spawnCtx.modelRegistry ?? null;
}

// -- Provider registration (with auto-discovery) --------------------------

async function registerEntry(pi: ExtensionAPI, name: string, entry: ProviderEntry): Promise<number> {
  const discovered = await discoverModels(entry.baseUrl, entry.apiKey);

  const models = discovered.map((m) => ({
    id: m.id,
    name: m.id,
    reasoning: false,
    input: ["text"] as ("text" | "image")[],
    contextWindow: 200000,
    maxTokens: 16384,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }));

  pi.registerProvider(name, {
    baseUrl: entry.baseUrl,
    apiKey: resolveApiKeyEnvName(name, entry.apiKey),
    api: (entry.api ?? "openai-completions") as any,
    models,
  });

  // Notify bridge directly (same package — no cross-package event needed)
  onProvidersChanged?.();

  return discovered.length;
}

// -- Extension entry point ------------------------------------------------

export function activate(pi: ExtensionAPI) {
  piRef = pi;
  const providers = loadProviders();

  // Register providers (async discovery, fire-and-forget at startup)
  for (const [name, entry] of Object.entries(providers)) {
    registerEntry(pi, name, entry).catch(() => {});
  }

  // ── Event API: Model Resolution ─────────────────────────────────────

  pi.events.on("flow:resolve-model", async (data: any) => {
    const modelRef: string = data?.modelRef;
    if (!modelRef) return;

    // Role aliases (@planning etc.) are handled by pi-flows role-manager.
    if (modelRef.startsWith("@")) return;

    const registry = getModelRegistry();
    if (!registry) return;

    const parts = modelRef.split("/");
    let model: any;
    if (parts.length >= 2) {
      model = registry.find(parts[0], parts.slice(1).join("/"));
    }
    if (!model) {
      const allModels = registry.getAll?.() ?? [];
      model = allModels.find((m: any) => m.id === modelRef);
    }
    if (!model) return;

    data.model = model;
    try {
      data.auth = await registry.getApiKeyAndHeaders(model);
    } catch {
      data.auth = { ok: false, error: "Auth resolution failed" };
    }
  });

  pi.events.on("flow:get-available-models", (data: any) => {
    const registry = getModelRegistry();
    if (!registry) {
      data.models = [];
      return;
    }
    try {
      const available = registry.getAvailable?.() ?? registry.getAll?.() ?? [];
      data.models = available.map((m: any) => ({
        provider: m.provider,
        id: m.id,
        name: m.name ?? m.id,
      }));
    } catch {
      data.models = [];
    }
  });

  // ── Session lifecycle ──────────────────────────────────────────────

  pi.on("model_select", async (_event, ctx) => {
    if (ctx.model) {
      currentSessionProvider = ctx.model.provider ?? "";
      currentSessionModelId = ctx.model.id ?? "";
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.model) {
      currentSessionProvider = ctx.model.provider ?? "";
      currentSessionModelId = ctx.model.id ?? "";
    }

    // Warn about providers missing API keys
    for (const [name, entry] of Object.entries(providers)) {
      if (!hasApiKey(name, entry)) {
        const hint = entry.apiKey.startsWith("$")
          ? `Set ${entry.apiKey}`
          : "Check API key";
        ctx.ui.notify(
          `${name}: ${hint} or add "${name}" to ~/.pi/agent/auth.json`,
          "warning",
        );
      }
    }
  });
}
