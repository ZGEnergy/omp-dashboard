/**
 * Fetches `/api/readme?cwd=...` on mount; re-fetches when `cwd` changes.
 *
 * Mirrors the fetch logic that lived in `useContentViews.handleViewReadme`
 * before overlay-url-routing migrated readme to a URL-driven overlay.
 *
 * See change: overlay-url-routing.
 */
import { useEffect, useState } from "react";
import { getApiBase } from "../lib/api-context.js";

export interface ReadmeFetchResult {
  content?: string;
  isLoading: boolean;
  error?: string;
}

export function useReadmeFetch(cwd: string): ReadmeFetchResult {
  const [result, setResult] = useState<ReadmeFetchResult>({ isLoading: true });
  useEffect(() => {
    let cancelled = false;
    setResult({ isLoading: true });
    (async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/readme?cwd=${encodeURIComponent(cwd)}`);
        const body = await res.json();
        if (cancelled) return;
        if (body.success) {
          setResult({ content: body.data.content, isLoading: false });
        } else {
          setResult({ isLoading: false, error: body.error });
        }
      } catch (err: any) {
        if (cancelled) return;
        setResult({ isLoading: false, error: err?.message ?? String(err) });
      }
    })();
    return () => { cancelled = true; };
  }, [cwd]);
  return result;
}
