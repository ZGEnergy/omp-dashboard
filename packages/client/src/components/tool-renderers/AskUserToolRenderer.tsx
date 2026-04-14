import React from "react";
import { Icon } from "@mdi/react";
import { mdiCommentQuestion, mdiCheckCircle, mdiAlertCircle, mdiFormTextbox, mdiCheckboxMarkedOutline, mdiFormatListBulleted, mdiRadioboxMarked } from "@mdi/js";
import type { ToolRendererProps } from "./types.js";
import { MarkdownContent } from "../MarkdownContent.js";

const methodIcons: Record<string, string> = {
  confirm: mdiCheckboxMarkedOutline,
  select: mdiRadioboxMarked,
  multiselect: mdiFormatListBulleted,
  input: mdiFormTextbox,
};

const methodLabels: Record<string, string> = {
  confirm: "Confirm",
  select: "Select",
  multiselect: "Multi-select",
  input: "Text input",
};

/** Rich renderer for ask_user tool calls — shows question, method, options, and response */
export function AskUserToolRenderer({ args, status, result }: ToolRendererProps) {
  const method = (args?.method as string) ?? "input";
  const title = (args?.title as string) ?? (args?.question as string) ?? "";
  const message = (args?.message as string) ?? (args?.question as string) ?? "";
  const rawOptions = args?.options;
  const options = Array.isArray(rawOptions)
    ? rawOptions as string[]
    : typeof rawOptions === "string"
      ? (() => { try { const p = JSON.parse(rawOptions); return Array.isArray(p) ? p : undefined; } catch { return undefined; } })()
      : undefined;
  const icon = methodIcons[method] ?? mdiCommentQuestion;
  const label = methodLabels[method] ?? method;

  // Parse the result to extract the user's response
  let userResponse: string | undefined;
  if (result) {
    const match = result.match(/User responded:\s*(.*)/s);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (typeof parsed === "boolean") {
          userResponse = parsed ? "Yes" : "No";
        } else if (typeof parsed === "string") {
          userResponse = parsed;
        } else if (parsed && typeof parsed === "object" && "value" in parsed) {
          userResponse = String(parsed.value);
        } else {
          userResponse = match[1];
        }
      } catch {
        userResponse = match[1];
      }
    }
  }

  const isError = status === "error";
  const isComplete = status === "complete";

  return (
    <div className="space-y-2">
      {/* Method badge */}
      <div className="flex items-center gap-1.5">
        <Icon path={icon} size={0.5} className="text-blue-400 shrink-0" />
        <span className="text-xs font-medium text-blue-400">{label}</span>
      </div>

      {/* Question title */}
      {title && (
        <div className="text-xs text-[var(--text-primary)]">
          <MarkdownContent content={title} />
        </div>
      )}

      {/* Message body (if different from title) */}
      {message && message !== title && (
        <div className="text-xs text-[var(--text-secondary)]">
          <MarkdownContent content={message} />
        </div>
      )}

      {/* Options list — only show when complete (running state has interactive dialog below) */}
      {options && options.length > 0 && status !== "running" && (
        <div className="flex flex-wrap gap-1">
          {options.map((opt, i) => {
            const isSelected = isComplete && userResponse === opt;
            return (
              <span
                key={i}
                className={isSelected
                  ? "px-1.5 py-0.5 text-xs rounded bg-green-600/20 border border-green-500/40 text-green-400 font-medium"
                  : "px-1.5 py-0.5 text-xs rounded bg-[var(--bg-primary)] border border-[var(--border-secondary)] text-[var(--text-tertiary)]"
                }
              >
                {isSelected && <Icon path={mdiCheckCircle} size={0.4} className="inline mr-0.5 -mt-0.5" />}
                {opt}
              </span>
            );
          })}
        </div>
      )}

      {/* Response (for non-select methods like input/confirm) */}
      {isComplete && userResponse !== undefined && !(options && options.length > 0) && (
        <div className="flex items-center gap-1.5 text-xs">
          <Icon path={mdiCheckCircle} size={0.45} className="text-green-400 shrink-0" />
          <span className="text-green-400 font-medium">Response:</span>
          <span className="text-[var(--text-primary)]">{userResponse}</span>
        </div>
      )}

      {/* Error output */}
      {isError && result && (
        <div className="flex items-start gap-1.5 text-xs">
          <Icon path={mdiAlertCircle} size={0.45} className="text-red-400 shrink-0 mt-0.5" />
          <pre className="whitespace-pre-wrap text-red-400/80">{result}</pre>
        </div>
      )}
    </div>
  );
}
