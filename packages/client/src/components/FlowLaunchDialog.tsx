import React, { useState, useRef, useEffect } from "react";
import { Icon } from "@mdi/react";
import { mdiPlay } from "@mdi/js";
import { DialogPortal } from "./DialogPortal.js";

export function FlowLaunchDialog({
  flowName,
  description,
  onSubmit,
  onCancel,
}: {
  flowName: string;
  description?: string;
  onSubmit: (task: string) => void;
  onCancel: () => void;
}) {
  const [task, setTask] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(task.trim());
  };

  return (
    <DialogPortal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <div className="absolute inset-0 bg-[var(--bg-overlay)]" onClick={onCancel} />
        <div className="relative bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)] shadow-2xl p-4 w-[90vw] max-w-md">
        <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">
          Run Flow: {flowName}
        </h3>
        {description && (
          <p className="text-[11px] text-[var(--text-tertiary)] mb-3">{description}</p>
        )}
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe the task (optional)..."
            className="w-full px-3 py-2 text-sm bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-500/50"
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              type="button"
              onClick={onCancel}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500"
            >
              <Icon path={mdiPlay} size={0.45} className="inline mr-0.5" />Run
            </button>
          </div>
        </form>
        </div>
      </div>
    </DialogPortal>
  );
}
