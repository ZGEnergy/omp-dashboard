/**
 * FlowYamlPopoverButton — paper-icon button that opens a popover anchored
 * to itself, fetches the flow's YAML at `/api/pi-resource-file?path=...`,
 * and renders it inside the popover via the `ui:markdown-content` primitive
 * (wrapped in a `yaml` code fence for syntax highlighting).
 *
 * Used by `FlowDashboard` (live flow) and `FlowSummary` (completed flow).
 *
 * The flow's YAML path is emitted by pi-flows in the `flow:flow-started`
 * event (see `packages/pi-flows/extensions/flow-engine/flow-tui.ts:487` —
 * `source: flow.source`) and stored on `FlowState.flowSource` by the flow
 * reducer.
 *
 * See change: add-ui-popover-primitive.
 */
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "@mdi/react";
import { mdiFileDocumentOutline } from "@mdi/js";
import { UI_PRIMITIVE_KEYS } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/ui-primitives.js";
import { useUiPrimitive } from "@blackbelt-technology/dashboard-plugin-runtime";

type YamlFetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; content: string }
  | { kind: "error"; error: string };

export function FlowYamlPopoverButton({
  flowSource,
  flowName,
}: {
  flowSource: string;
  flowName: string;
}) {
  const Popover = useUiPrimitive(UI_PRIMITIVE_KEYS.popover);
  const MarkdownContent = useUiPrimitive(UI_PRIMITIVE_KEYS.markdownContent);
  const ref = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<YamlFetchState>({ kind: "idle" });

  // Deps include only `open` + `flowSource`. Including state.kind would
  // cause cleanup to fire on the idle→loading transition, self-cancelling
  // the fetch. Same pattern as `usePiResourceFileFetch` in the client.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ kind: "loading" });
    fetch(`/api/pi-resource-file?path=${encodeURIComponent(flowSource)}`)
      .then(async (r) => {
        const json = await r.json();
        if (cancelled) return;
        if (json?.success && typeof json?.data?.content === "string") {
          setState({ kind: "loaded", content: json.data.content });
        } else {
          setState({
            kind: "error",
            error: typeof json?.error === "string" ? json.error : "Failed to read flow YAML",
          });
        }
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: "error", error: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [open, flowSource]);

  return (
    <>
      <button
        ref={ref}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={`transition-colors p-0.5 rounded inline-flex items-center ${
          open
            ? "text-blue-400 bg-blue-400/10"
            : "text-[var(--text-tertiary)] hover:text-blue-400 hover:bg-[var(--bg-surface)]"
        }`}
        title={open ? "Close flow YAML" : `View ${flowName} YAML`}
      >
        <Icon path={mdiFileDocumentOutline} size={0.5} />
      </button>
      {open && ref.current && (
        <Popover anchorEl={ref.current} onDismiss={() => setOpen(false)}>
          <div
            className="w-[640px] max-w-[90vw] max-h-[70vh] overflow-auto bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md shadow-xl p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[11px] text-[var(--text-tertiary)] mb-2 font-mono truncate" title={flowSource}>
              {flowSource}
            </div>
            {state.kind === "loading" && (
              <div className="text-xs text-[var(--text-muted)]">Loading…</div>
            )}
            {state.kind === "error" && (
              <div className="text-xs text-red-400">⚠ {state.error}</div>
            )}
            {state.kind === "loaded" && (
              <MarkdownContent content={"```yaml\n" + state.content + "\n```"} />
            )}
          </div>
        </Popover>
      )}
    </>
  );
}
