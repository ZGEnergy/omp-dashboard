/**
 * Always-visible chip on the session card showing the current jj
 * workspace name. Predicate-gated by `isInJjWorkspace` so it renders
 * nothing when the session is outside a jj repo.
 *
 * See change: add-jj-workspace-plugin.
 */
import React, { useEffect, useState } from "react";
import Icon from "@mdi/react";
import { mdiSourceFork } from "@mdi/js";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";

/** Tracks `<html data-theme>` reactively so badge palette flips with the dashboard theme. */
function useIsLightTheme(): boolean {
  const read = () =>
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme") === "light";
  const [light, setLight] = useState(read);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const obs = new MutationObserver(() => setLight(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return light;
}

export function JjWorkspaceBadge({
  session,
}: {
  session: DashboardSession;
}): React.ReactElement | null {
  const name = session.jjState?.workspaceName;
  const light = useIsLightTheme();
  if (!name) return null;

  const colocated = session.jjState?.isColocated;
  const tooltip = colocated
    ? `jj workspace: ${name} (colocated with git)`
    : `jj workspace: ${name}`;

  // Indigo palette tuned per theme — dark uses 300-shade text on translucent
  // tint; light uses 700-shade text on slightly stronger tint for contrast
  // (300-shade was unreadable on #f0f0f0).
  const palette = light
    ? { background: "rgba(99, 102, 241, 0.15)", color: "rgb(67, 56, 202)" } // indigo-700
    : { background: "rgba(99, 102, 241, 0.15)", color: "rgb(165, 180, 252)" }; // indigo-300

  return (
    <span
      data-testid="jj-workspace-badge"
      title={tooltip}
      className="inline-flex items-center gap-1 px-1.5 py-[1px] rounded font-mono text-[10px]"
      style={{ ...palette, verticalAlign: "middle" }}
    >
      <Icon path={mdiSourceFork} size={0.5} />
      <span>jj:{name}</span>
    </span>
  );
}
