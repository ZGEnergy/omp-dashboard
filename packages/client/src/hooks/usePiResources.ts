import { useState, useEffect, useCallback, useRef } from "react";
import type { PiResourcesResult } from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";

const POLL_INTERVAL = 30_000;

export function usePiResources(cwd: string | null) {
  const [data, setData] = useState<PiResourcesResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;

  const fetchResources = useCallback(async (targetCwd: string, forceRefresh = false) => {
    try {
      const url = `/api/pi-resources?cwd=${encodeURIComponent(targetCwd)}${forceRefresh ? "&refresh=true" : ""}`;
      const res = await fetch(url);
      const body = await res.json();
      if (cwdRef.current !== targetCwd) return; // stale
      if (body.success) {
        setData(body.data);
        setError(null);
      } else {
        setError(body.error ?? "Failed to fetch pi resources");
      }
    } catch (err: any) {
      if (cwdRef.current !== targetCwd) return;
      setError(err.message ?? "Network error");
    }
  }, []);

  useEffect(() => {
    if (!cwd) {
      setData(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    fetchResources(cwd).finally(() => setIsLoading(false));

    const timer = setInterval(() => fetchResources(cwd), POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [cwd, fetchResources]);

  const refresh = useCallback(() => {
    if (cwd) {
      setIsLoading(true);
      fetchResources(cwd, true).finally(() => setIsLoading(false));
    }
  }, [cwd, fetchResources]);

  return { data, isLoading, error, refresh };
}
