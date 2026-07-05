/**
 * Settings-section for the flows plugin: the GLOBAL edit-mode default.
 *
 * Reads/writes pi's own global layer (`~/.pi/agent/settings.json`
 * `flows.editFlow`) via the flows edit-mode route — the dashboard keeps no
 * private plugin-config copy. Per-cwd overrides live on each folder's
 * settings page (`FlowsFolderSettings`); pi-flows resolves
 * `project ?? global` at session_start.
 *
 * Uses the unified buffered-draft save contract (commits via the host
 * Settings panel's Save). See change: flows-edit-mode-folder-settings.
 */

import { useSettingsDraftSource } from "@blackbelt-technology/dashboard-plugin-runtime";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditMode } from "./useEditMode.js";

export function FlowsSettings(): React.ReactElement {
  const { state, setEditMode } = useEditMode();

  const base = state?.global ?? false;
  const [editFlow, setEditFlow] = useState<boolean>(base);
  // Adopt the server value once it arrives (state starts null).
  const loadedRef = useRef(false);
  useEffect(() => {
    if (state !== null && !loadedRef.current) {
      loadedRef.current = true;
      setEditFlow(state.global ?? false);
    }
  }, [state]);

  const isDirty = editFlow !== base;

  const valuesRef = useRef(editFlow);
  valuesRef.current = editFlow;
  const baseRef = useRef(base);
  baseRef.current = base;

  const commit = useCallback(async () => {
    await setEditMode("global", valuesRef.current);
  }, [setEditMode]);
  const reset = useCallback(() => setEditFlow(baseRef.current), []);
  useSettingsDraftSource({ id: "plugin:flows", page: "plugins", isDirty, commit, reset });

  return (
    <section className="border border-[var(--border-primary)] rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-0.5">Flows</h3>
      <p className="text-xs text-[var(--text-tertiary)] mb-3">
        Multi-agent workflow orchestration. Global default (stored in pi's own
        settings); per-directory overrides live on each folder's settings page.
      </p>
      <label className="flex gap-2.5 items-start text-[13px] cursor-pointer">
        <input
          type="checkbox"
          checked={editFlow}
          onChange={(e) => setEditFlow(e.target.checked)}
          className="mt-0.5"
          data-testid="flows-edit-mode-toggle"
        />
        <span>
          <span className="font-medium">Edit mode</span>
          {" — allow the main session to author flows & agents"}
          <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
            Activates <code>flow_agents</code> / <code>flow_write</code> and makes the
            edit-flow skill model-visible. Off by default. Applies at each
            session's next start unless a directory overrides it.
          </span>
        </span>
      </label>
    </section>
  );
}
