import React from "react";
import { Icon } from "@mdi/react";
import { mdiOpenInNew } from "@mdi/js";
import { openEditor } from "../../lib/editor-api.js";
import type { ToolContext } from "./types.js";

interface Props {
  filePath?: string;
  line?: number;
  context: ToolContext;
}

/** Small button to open a file in the detected editor */
export function OpenFileButton({ filePath, line, context }: Props) {
  const { cwd, editors } = context;
  if (!cwd || editors.length === 0 || !filePath) return null;

  const editor = editors[0]; // Use first detected editor

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await openEditor(cwd, editor.id, filePath, line);
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-0.5 text-[10px] text-[var(--text-tertiary)] hover:text-blue-400 transition-colors"
      title={`Open in ${editor.name}`}
    >
      <Icon path={mdiOpenInNew} size={0.45} />
      <span>{editor.name}</span>
    </button>
  );
}
