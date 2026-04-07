import React, { useState } from "react";
import { Icon } from "@mdi/react";
import { mdiClose, mdiCompassOutline } from "@mdi/js";

interface Props {
  changeName: string;
  onSend: (text: string) => void;
  onClose: () => void;
}

export function ExploreDialog({ changeName, onSend, onClose }: Props) {
  const [text, setText] = useState("");

  const handleSend = () => {
    if (text.trim()) {
      onSend(text.trim());
    }
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center" data-testid="explore-dialog">
      <div className="absolute inset-0 bg-[var(--bg-overlay)]" onClick={onClose} />
      <div className="relative bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded-lg p-4 max-w-md w-full mx-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-[var(--text-secondary)]">Explore: {changeName}</h3>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><Icon path={mdiClose} size={0.6} /></button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What do you want to explore?"
          className="w-full h-24 bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded p-2 text-sm text-[var(--text-secondary)] resize-none focus:outline-none focus:border-blue-500"
          autoFocus
          data-testid="explore-textarea"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            data-testid="explore-cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 text-[var(--text-primary)] hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="explore-send"
          >
            <Icon path={mdiCompassOutline} size={0.5} className="inline mr-0.5" />Explore
          </button>
        </div>
      </div>
    </div>
  );
}
