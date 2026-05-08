/**
 * Wrapper around pi-ai's streamSimple for model proxy route handlers.
 *
 * Resolves model credentials from the InternalRegistry, then delegates
 * to pi-ai's streamSimple. Returns an AsyncIterable of pi-ai StreamEvents.
 *
 * See change: add-dashboard-model-proxy, task 6.1.
 */
import { getModelRegistry } from "./registry-singleton.js";
import type { PiAiModule } from "./internal-registry.js";

export interface StreamCompletionOpts {
  model: any;
  messages: any[];
  system?: string;
  tools?: any[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface RegistryLike {
  getApiKeyAndHeaders(model: any): Promise<{ apiKey: string; headers: Record<string, string> }>;
}

/**
 * Stream a completion from the upstream provider via pi-ai's streamSimple.
 *
 * Resolves API key + headers from the registry, then calls streamSimple.
 * The returned iterable yields pi-ai's AssistantMessageEvent objects.
 *
 * @param opts - stream options
 * @param piAiStreamSimple - pi-ai's streamSimple function
 * @param registryOverride - optional registry for testing (defaults to getModelRegistry())
 */
export async function streamCompletion(
  opts: StreamCompletionOpts,
  piAiStreamSimple: PiAiModule["streamSimple"],
  registryOverride?: RegistryLike,
): Promise<AsyncIterable<any>> {
  const registry = registryOverride ?? await getModelRegistry();
  const { apiKey, headers } = await registry.getApiKeyAndHeaders(opts.model);

  const callOpts: any = {
    model: opts.model,
    messages: opts.messages,
    ...(opts.system !== undefined ? { system: opts.system } : {}),
    ...(opts.tools ? { tools: opts.tools } : {}),
    ...(opts.maxTokens != null ? { maxTokens: opts.maxTokens } : {}),
    ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
    apiKey,
    headers,
  };

  return piAiStreamSimple(callOpts);
}
