import React from "react";
import { Icon } from "@mdi/react";
import { mdiCheckCircle, mdiFormatListBulleted } from "@mdi/js";
import type { InteractiveRendererProps } from "./types.js";
import { InlineMarkdown } from "./InlineMarkdown.js";
import { MarkdownContent } from "../MarkdownContent.js";

export function SelectRenderer({ params, status, result, onRespond, onCancel }: InteractiveRendererProps) {
  const title = params.title as string;
  const message = params.message as string | undefined;
  const options = (params.options as string[]) ?? [];
  const selectedValue = (result as any)?.value as string | undefined;

  if (status !== "pending") {
    return (
      <div className="mx-4 my-1 p-2 bg-[var(--bg-hover)] rounded text-xs flex items-center gap-2">
        <Icon path={mdiFormatListBulleted} size={0.55} className="text-[var(--text-secondary)] shrink-0" />
        <span className="text-[var(--text-secondary)]"><InlineMarkdown content={title} /></span>
        {status === "resolved" && selectedValue && (
          <span className="ml-1 inline-flex items-center gap-0.5 text-green-400">
            <Icon path={mdiCheckCircle} size={0.55} /> {selectedValue}
          </span>
        )}
        {status === "cancelled" && (
          <span className="ml-1 text-[var(--text-tertiary)]">Cancelled</span>
        )}
        {status === "dismissed" && (
          <span className="ml-1 text-[var(--text-tertiary)]">Answered in terminal</span>
        )}
      </div>
    );
  }

  return (
    <div className="mx-4 my-2 p-3 bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Icon path={mdiFormatListBulleted} size={0.6} className="text-blue-400 shrink-0" />
        <span className="text-sm font-medium text-[var(--text-primary)]"><InlineMarkdown content={title} /></span>
      </div>
      {message && (
        <div className="text-xs text-[var(--text-secondary)] mb-3 ml-6"><MarkdownContent content={message} /></div>
      )}
      <div className="flex flex-wrap gap-2 ml-6">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onRespond({ value: option })}
            className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            {option}
          </button>
        ))}
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
