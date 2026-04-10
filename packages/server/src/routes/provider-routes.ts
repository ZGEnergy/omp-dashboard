/**
 * Provider REST API routes: read/write custom LLM providers (~/.pi/agent/providers.json).
 */
import type { FastifyInstance } from "fastify";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { NetworkGuard } from "./route-deps.js";

const REDACTED = "***";
const CONFIG_PATH = join(homedir(), ".pi", "agent", "providers.json");

interface ProviderEntry {
  baseUrl: string;
  apiKey: string;
  api?: string;
}

function readProvidersRaw(): Record<string, ProviderEntry> {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    return raw.providers ?? {};
  } catch {
    return {};
  }
}

function redactProviders(
  providers: Record<string, ProviderEntry>,
): Record<string, ProviderEntry> {
  const redacted: Record<string, ProviderEntry> = {};
  for (const [name, entry] of Object.entries(providers)) {
    redacted[name] = {
      ...entry,
      apiKey:
        entry.apiKey && entry.apiKey.startsWith("$")
          ? entry.apiKey
          : entry.apiKey
            ? REDACTED
            : "",
    };
  }
  return redacted;
}

export function registerProviderRoutes(fastify: FastifyInstance, deps: { networkGuard: NetworkGuard }): void {
  const { networkGuard } = deps;
  fastify.get(
    "/api/providers",
    { preHandler: networkGuard },
    async () => {
      const providers = readProvidersRaw();
      return { success: true, providers: redactProviders(providers) };
    },
  );

  fastify.put(
    "/api/providers",
    { preHandler: networkGuard },
    async (request, reply) => {
      const body = request.body as Record<string, any> | null;
      if (!body || typeof body !== "object" || !body.providers || typeof body.providers !== "object") {
        return reply.code(400).send({ success: false, error: "Invalid body" });
      }

      const incoming = body.providers as Record<string, ProviderEntry>;
      const existing = readProvidersRaw();

      // Merge: preserve redacted apiKey values from existing file
      const merged: Record<string, ProviderEntry> = {};
      for (const [name, entry] of Object.entries(incoming)) {
        merged[name] = {
          baseUrl: entry.baseUrl,
          apiKey:
            entry.apiKey === REDACTED && existing[name]
              ? existing[name].apiKey
              : entry.apiKey,
          api: entry.api,
        };
      }

      // Read raw file to preserve any non-providers fields
      let fileData: Record<string, any> = {};
      if (existsSync(CONFIG_PATH)) {
        try {
          fileData = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
        } catch {
          // start fresh
        }
      }
      fileData.providers = merged;

      const dir = dirname(CONFIG_PATH);
      mkdirSync(dir, { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify(fileData, null, 2) + "\n", "utf-8");

      return { success: true };
    },
  );
}
