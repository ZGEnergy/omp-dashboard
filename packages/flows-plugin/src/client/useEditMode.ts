/**
 * Client hook for the flows edit-mode setting.
 *
 * Reads `{ project, global, effective }` from the flows-plugin server route
 * (pi-flows' own settings files — the dashboard keeps no private copy) and
 * exposes a scope-aware setter. See change: flows-edit-mode-folder-settings.
 */
import { useCallback, useEffect, useState } from "react";

export interface EditModeState {
  project: boolean | null;
  global: boolean | null;
  effective: boolean;
}

export function useEditMode(cwd?: string): {
  state: EditModeState | null;
  setEditMode: (scope: "project" | "global", enabled: boolean) => Promise<void>;
} {
  const [state, setState] = useState<EditModeState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qs = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
    fetch(`/api/plugins/flows/edit-mode${qs}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.success) setState(j.data as EditModeState);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const setEditMode = useCallback(
    async (scope: "project" | "global", enabled: boolean) => {
      const res = await fetch("/api/plugins/flows/edit-mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, scope, enabled }),
      });
      const j = await res.json();
      if (j?.success) setState(j.data as EditModeState);
    },
    [cwd],
  );

  return { state, setEditMode };
}
