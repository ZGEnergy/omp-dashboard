/**
 * Session-header split/unsplit toggle. Self-contained: reads the split state
 * from `SplitWorkspaceContext` and flips `open` on click. Renders nothing when
 * mounted outside a provider (no selected session), so it can be dropped into
 * the shared `SessionHeader` without prop threading.
 *
 * See change: split-editor-workspace.
 */

import { mdiViewSplitVertical } from "@mdi/js";
import { Icon } from "@mdi/react";
import { t as i18nT } from "../lib/i18n";
import { useOptionalSplitWorkspace } from "./SplitWorkspaceContext.js";

export function SplitToggleButton() {
  const ctx = useOptionalSplitWorkspace();
  if (!ctx) return null;
  const open = ctx.split.open;
  return (
    <button
      type="button"
      onClick={() => ctx.toggleSplit()}
      aria-pressed={open}
      data-testid="split-toggle"
      className={`text-[10px] px-1.5 py-0.5 rounded border mr-1 transition-colors ${
        open
          ? "border-blue-500/40 text-blue-400 bg-blue-500/10"
          : "border-[var(--border-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
      }`}
      title={
        open
          ? i18nT("split.unsplit", undefined, "Close editor split")
          : i18nT("split.split", undefined, "Open editor split")
      }
    >
      <Icon path={mdiViewSplitVertical} size={0.4} className="inline mr-0.5" />
      {open ? i18nT("split.unsplitLabel", undefined, "Unsplit") : i18nT("split.splitLabel", undefined, "Split")}
    </button>
  );
}
