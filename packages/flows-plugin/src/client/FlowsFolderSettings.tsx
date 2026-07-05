/**
 * Folder-settings section for the flows plugin (`folder-settings-section`
 * claim): the per-cwd edit-mode toggle.
 *
 * Shows the EFFECTIVE value (`project ?? global ?? false`) with an inherited-
 * from-global hint when the project file has no value. Toggling writes the
 * PROJECT scope via the flows edit-mode route, then reloads the cwd's
 * connected sessions through the existing folder-scoped reload endpoint so
 * the authoring tools + edit-flow skill apply live. Works with zero flows
 * and zero sessions (author-first-flow bootstrap).
 *
 * See change: flows-edit-mode-folder-settings.
 */
import type React from "react";
import { useState } from "react";
import { useEditMode } from "./useEditMode.js";

export function FlowsFolderSettings({ cwd }: { cwd?: string }): React.ReactElement | null {
  const { state, setEditMode } = useEditMode(cwd);
  const [busy, setBusy] = useState(false);
  if (!cwd) return null;

  const inherited = state !== null && state.project === null;

  async function onToggle(enabled: boolean) {
    setBusy(true);
    try {
      await setEditMode("project", enabled);
      // Live-apply: reload connected sessions in this cwd (no-op when none).
      await fetch("/api/resources/reload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "local", cwd }),
      }).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="border border-[var(--border-primary)] rounded-lg p-4"
      data-testid="flows-folder-settings"
    >
      <h3 className="text-sm font-semibold mb-0.5">Flows</h3>
      <p className="text-xs text-[var(--text-tertiary)] mb-3">
        Flow authoring for this directory. Stored in <code>.pi/settings.json</code>.
      </p>
      <label className="flex gap-2.5 items-start text-[13px] cursor-pointer">
        <input
          type="checkbox"
          checked={state?.effective ?? false}
          disabled={state === null || busy}
          onChange={(e) => void onToggle(e.target.checked)}
          className="mt-0.5"
          data-testid="flows-folder-edit-mode-toggle"
        />
        <span>
          <span className="font-medium">Edit mode</span>
          {" — allow sessions in this directory to author flows & agents"}
          <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
            Activates <code>flow_agents</code> / <code>flow_write</code> and the edit-flow
            skill. Toggling reloads this directory's connected sessions.
            {inherited && (
              <span data-testid="flows-edit-mode-inherited"> Currently inherited from the global default.</span>
            )}
          </span>
        </span>
      </label>
    </section>
  );
}
