/**
 * Hook for bootstrap-install state. Fetches `GET /api/bootstrap/status`
 * on mount and subscribes to the `bootstrap-status` CustomEvent
 * dispatched from `useMessageHandler` when the server broadcasts a
 * `bootstrap_status_update` over WebSocket.
 *
 * See change: unified-bootstrap-install \u00a76.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBase } from "../lib/api-context.js";
import type { BootstrapStateSnapshot } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";

export interface UseBootstrapStatusResult {
  state: BootstrapStateSnapshot | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** POST /api/bootstrap/retry \u2014 only meaningful when state.status === "failed". */
  retry: () => Promise<void>;
  /** POST /api/bootstrap/upgrade-pi \u2014 used by the Upgrade button. */
  upgradePi: () => Promise<{ ok: true; ticketId: string } | { ok: false; error: string }>;
}

export function useBootstrapStatus(): UseBootstrapStatusResult {
  const [state, setState] = useState<BootstrapStateSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/api/bootstrap/status`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = (await res.json()) as BootstrapStateSnapshot;
      if (mounted.current) setState(body);
    } catch (err: any) {
      if (mounted.current) setError(err?.message ?? "network error");
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, []);

  const retry = useCallback(async () => {
    await fetch(`${getApiBase()}/api/bootstrap/retry`, { method: "POST" });
    // Status will update via the WS broadcast; no need to re-fetch here.
  }, []);

  const upgradePi = useCallback(
    async (): Promise<{ ok: true; ticketId: string } | { ok: false; error: string }> => {
      try {
        const res = await fetch(`${getApiBase()}/api/bootstrap/upgrade-pi`, { method: "POST" });
        const body = await res.json();
        if (res.ok && typeof body?.ticketId === "string") {
          return { ok: true, ticketId: body.ticketId };
        }
        return { ok: false, error: body?.error ?? `HTTP ${res.status}` };
      } catch (err: any) {
        return { ok: false, error: err?.message ?? "network error" };
      }
    },
    [],
  );

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { type: "bootstrap_status_update"; state: BootstrapStateSnapshot }
        | undefined;
      if (detail?.type === "bootstrap_status_update" && detail.state) {
        setState(detail.state);
      }
    };
    window.addEventListener("bootstrap-status", handler);
    return () => {
      mounted.current = false;
      window.removeEventListener("bootstrap-status", handler);
    };
  }, [refresh]);

  return { state, isLoading, error, refresh, retry, upgradePi };
}
