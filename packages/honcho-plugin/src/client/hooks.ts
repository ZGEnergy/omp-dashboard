/**
 * Shared hooks for honcho plugin client components.
 */
import { useState, useEffect, useCallback } from "react";
import type { RedactedHonchoPluginConfig, HonchoPluginStatus } from "../shared/types.js";
import { fetchConfig, fetchStatus, checkExtensionInstalled } from "./api.js";

/** Poll-based config fetcher. Refreshes on `deps` change or manual trigger. */
export function useHonchoConfig() {
  const [config, setConfig] = useState<RedactedHonchoPluginConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const cfg = await fetchConfig();
      setConfig(cfg);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { config, loading, error, refresh };
}

/** Fetch plugin status once. */
export function useHonchoStatus() {
  const [status, setStatus] = useState<HonchoPluginStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchStatus());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, refresh };
}

// Module-level sync-readable install-state cache.
//
// The `useExtensionInstalled` hook is async (it probes `/api/packages/installed`)
// but `shouldRender` callbacks declared in the plugin manifest must be
// synchronous. We mirror the latest probe result into this cache so the
// manifest-level gate can read it without awaiting.
//
// Default is `false` (closed-by-default) until the first probe completes —
// this prevents the MEMORY subcard from flickering visible-then-hidden on cold
// boot. The cache is updated on every `useExtensionInstalled` mount/refresh,
// and is also re-populated by the new `primeExtensionInstalledCache()` entry
// point so non-hook code paths can trigger a refresh.
//
// See change: auto-hide-empty-session-subcards.
let extensionInstalledCache = false;
let initialPrimePromise: Promise<void> | null = null;

/** Sync-readable accessor. Returns false until the first probe completes. */
export function getHonchoExtensionInstalledSync(): boolean {
  return extensionInstalledCache;
}

/** Imperative refresh of the sync cache. Fire-and-forget; resolves on completion. */
export async function primeExtensionInstalledCache(): Promise<void> {
  if (initialPrimePromise) return initialPrimePromise;
  initialPrimePromise = (async () => {
    try {
      extensionInstalledCache = await checkExtensionInstalled();
    } catch {
      extensionInstalledCache = false;
    }
  })();
  try {
    await initialPrimePromise;
  } finally {
    initialPrimePromise = null;
  }
}

// Kick off the initial probe at module-load time so the cache populates as
// soon as the plugin's client entry is imported. The promise is intentionally
// fire-and-forget; UI components consult the cache via
// `getHonchoExtensionInstalledSync()`.
void primeExtensionInstalledCache();

/** Check if pi-memory-honcho extension is installed. */
export function useExtensionInstalled() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const result = await checkExtensionInstalled();
      setInstalled(result);
      extensionInstalledCache = result;
    } catch {
      setInstalled(false);
      extensionInstalledCache = false;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return { installed, checking, recheck: check };
}
