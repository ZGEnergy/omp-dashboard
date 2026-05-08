/**
 * Nested concurrency caps for the model proxy.
 *
 * Three levels: server-wide, per-API-key, per-upstream-provider.
 * Caps read from config at acquire time so live config updates take effect.
 *
 * See change: add-dashboard-model-proxy.
 */
import type { ModelProxyConfig } from "@blackbelt-technology/pi-dashboard-shared/config.js";

export type ConcurrencyErrorCode = "SERVER_FULL" | "KEY_FULL" | "PROVIDER_FULL";

export class ConcurrencyError extends Error {
  public readonly code: ConcurrencyErrorCode;
  public readonly retryAfterMs: number;

  constructor(code: ConcurrencyErrorCode, retryAfterMs = 1000) {
    super(`Concurrency limit exceeded: ${code}`);
    this.name = "ConcurrencyError";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export class ConcurrencyTracker {
  private serverCount = 0;
  private perKey = new Map<string, number>();
  private perProvider = new Map<string, number>();

  /**
   * Acquire a concurrency slot. Returns a release() callback.
   * Throws ConcurrencyError if any cap is exceeded.
   */
  acquire(
    opts: { apiKeyId: string; provider: string },
    config: ModelProxyConfig,
  ): () => void {
    const { apiKeyId, provider } = opts;

    // Server-wide check
    if (this.serverCount >= config.maxConcurrentStreams) {
      throw new ConcurrencyError("SERVER_FULL");
    }

    // Per-key check
    const keyCount = this.perKey.get(apiKeyId) ?? 0;
    if (keyCount >= config.perKeyConcurrentStreams) {
      throw new ConcurrencyError("KEY_FULL");
    }

    // Per-provider check
    const providerCount = this.perProvider.get(provider) ?? 0;
    const providerCap = config.perProviderCaps?.[provider] ?? 4;
    if (providerCount >= providerCap) {
      throw new ConcurrencyError("PROVIDER_FULL");
    }

    // Acquire all three
    this.serverCount++;
    this.perKey.set(apiKeyId, keyCount + 1);
    this.perProvider.set(provider, providerCount + 1);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.serverCount = Math.max(0, this.serverCount - 1);
      const newKeyCount = Math.max(0, (this.perKey.get(apiKeyId) ?? 1) - 1);
      if (newKeyCount === 0) this.perKey.delete(apiKeyId);
      else this.perKey.set(apiKeyId, newKeyCount);
      const newProviderCount = Math.max(0, (this.perProvider.get(provider) ?? 1) - 1);
      if (newProviderCount === 0) this.perProvider.delete(provider);
      else this.perProvider.set(provider, newProviderCount);
    };
  }
}
