/**
 * Renders a collapsed group of repeated tool calls.
 * Shows a count badge and summary; expands to reveal all individual calls.
 */

import { toolCallPrefKey } from "@blackbelt-technology/pi-dashboard-shared/display-prefs.js";
import { mdiChevronDown, mdiChevronRight, mdiRepeat } from "@mdi/js";
import { Icon } from "@mdi/react";
import React, { useState } from "react";
import { useDisplayPrefs } from "../hooks/useDisplayPrefs.js";
import { useMobile } from "../hooks/useMobile.js";
import type { ToolCallGroup } from "../lib/group-tool-calls.js";
import { getSummary } from "../lib/tool-summary.js";
import { ToolCallStep } from "./ToolCallStep.js";
import type { ToolContext } from "./tool-renderers/index.js";

interface Props {
  group: ToolCallGroup;
  toolContext: ToolContext;
}

export function CollapsedToolGroup({ group, toolContext }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isMobile = useMobile();
  const prefs = useDisplayPrefs();
  // Filter members by tool-kind toggle; `ask_user` is never gated.
  // Hide the entire group only if every member is gated off.
  // See change: configurable-chat-display.
  const visibleMessages = group.messages.filter((m) => {
    const key = toolCallPrefKey(m.toolName ?? "");
    return key === null || prefs.toolCalls[key];
  });
  if (visibleMessages.length === 0) return null;
  const lastMsg = group.messages[group.messages.length - 1];
  const firstArgs = group.messages[0]?.args;

  return (
    <div className={`${isMobile ? "mx-2" : "mx-4"} border-l-2 border-[var(--border-secondary)] pl-3`}>
      <button
        onClick={() => setExpanded(!expanded)}
        title={getSummary(group.toolName, firstArgs)}
        className={`flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] w-full text-left ${isMobile ? "min-h-[44px] py-2" : ""}`}
        data-testid="collapsed-group"
      >
        <span className="inline-flex text-[var(--text-muted)]">
          <Icon path={mdiRepeat} size={0.55} />
        </span>
        <span className="truncate">{getSummary(group.toolName, firstArgs)}</span>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)] text-[10px] font-medium">
          ×{visibleMessages.length}
        </span>
        <span className="ml-auto text-[var(--text-muted)] inline-flex">
          <Icon path={expanded ? mdiChevronDown : mdiChevronRight} size={0.6} />
        </span>
      </button>
      {expanded && (
        <div className="mt-1 space-y-0.5">
          {visibleMessages.map((msg) => (
            <ToolCallStep
              key={msg.id}
              toolName={msg.toolName ?? "unknown"}
              toolCallId={msg.toolCallId ?? msg.id}
              args={msg.args}
              status={msg.toolStatus ?? "complete"}
              result={msg.result}
              images={msg.images}
              context={toolContext}
              startedAt={msg.startedAt}
              duration={msg.duration}
              showResultBody={prefs.toolResults || msg.toolName === "ask_user"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
