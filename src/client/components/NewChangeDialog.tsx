import React, { useState } from "react";
import { Icon } from "@mdi/react";
import { mdiClose, mdiSend } from "@mdi/js";

interface Props {
  onSend: (prompt: string) => void;
  onClose: () => void;
}

export function formatNewChangePrompt(name: string, description: string): string {
  const trimName = name.trim();
  const trimDesc = description.trim();
  if (trimName && trimDesc) return `/opsx:new ${trimName}\n${trimDesc}`;
  if (trimName) return `/opsx:new ${trimName}`;
  if (trimDesc) return `/opsx:new\n${trimDesc}`;
  return "/opsx:new";
}

export function NewChangeDialog({ onSend, onClose }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSend = () => {
    onSend(formatNewChangePrompt(name, description));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSend();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" data-testid="new-change-dialog">
      <div className="absolute inset-0 bg-[var(--bg-overlay)]" onClick={onClose} />
      <div className="relative bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded-lg p-4 max-w-md w-full mx-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-[var(--text-secondary)]">New Change</h3>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><Icon path={mdiClose} size={0.6} /></button>
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="change-name (optional)"
          className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded p-2 text-sm text-[var(--text-secondary)] focus:outline-none focus:border-blue-500"
          autoFocus
          data-testid="new-change-name"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Description (optional)"
          className="w-full h-24 bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded p-2 text-sm text-[var(--text-secondary)] resize-none focus:outline-none focus:border-blue-500"
          data-testid="new-change-description"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            data-testid="new-change-cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 text-[var(--text-primary)] hover:bg-blue-500"
            data-testid="new-change-send"
          >
            <Icon path={mdiSend} size={0.45} className="inline mr-0.5" />Send
          </button>
        </div>
      </div>
    </div>
  );
}
