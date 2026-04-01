import React, { useState, useRef, useEffect } from "react";
import { Icon } from "@mdi/react";
import { mdiChevronDown } from "@mdi/js";
import type { ModelInfo } from "../../shared/types.js";

interface Props {
  current?: string;
  models?: ModelInfo[];
  onSelect: (model: string) => void;
}

export function ModelSelector({ current, models, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasModels = models && models.length > 0;

  // Clear pending state when current model updates to match
  useEffect(() => {
    if (pendingModel && current === pendingModel) {
      setPendingModel(null);
    }
  }, [current, pendingModel]);

  // Safety timeout: clear pending after 10s if no update arrives
  useEffect(() => {
    if (!pendingModel) return;
    const timer = setTimeout(() => setPendingModel(null), 10_000);
    return () => clearTimeout(timer);
  }, [pendingModel]);

  const filtered = hasModels
    ? models.filter((m) => {
        const q = filter.toLowerCase();
        return `${m.provider}/${m.id}`.toLowerCase().includes(q);
      })
    : [];

  // Reset filter and index when opening
  useEffect(() => {
    if (open) {
      setFilter("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = (m: ModelInfo) => {
    const label = `${m.provider}/${m.id}`;
    setPendingModel(label);
    onSelect(label);
    setOpen(false);
  };

  const displayModel = pendingModel ?? current;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) handleSelect(filtered[selectedIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative" data-testid="model-selector">
      <button
        onClick={() => hasModels && setOpen(!open)}
        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
          hasModels
            ? "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            : "text-[var(--text-muted)]"
        }`}
        disabled={!hasModels}
        data-testid="model-selector-button"
      >
        <span className="font-mono truncate max-w-[200px]">
          {pendingModel ? `${pendingModel} ⏳` : (current ?? "no model")}
        </span>
        {hasModels && !pendingModel && <Icon path={mdiChevronDown} size={0.5} />}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-72 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded-lg shadow-lg z-50 overflow-hidden" data-testid="model-dropdown">
          <div className="p-1.5">
            <input
              ref={inputRef}
              value={filter}
              onChange={(e) => { setFilter(e.target.value); setSelectedIndex(0); }}
              onKeyDown={handleKeyDown}
              placeholder="Filter models…"
              className="w-full px-2 py-1 text-xs bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)]"
              data-testid="model-filter"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--text-muted)]">No models match</div>
            ) : (
              filtered.map((m, i) => {
                const label = `${m.provider}/${m.id}`;
                const isCurrent = label === current;
                return (
                  <button
                    key={label}
                    onClick={() => handleSelect(m)}
                    className={`w-full px-3 py-1.5 md:py-1.5 min-h-[44px] md:min-h-0 text-left text-xs font-mono flex items-center gap-2 ${
                      i === selectedIndex ? "bg-[var(--bg-tertiary)]" : "hover:bg-[var(--bg-hover)]"
                    } ${isCurrent ? "text-[var(--accent-blue)]" : "text-[var(--text-secondary)]"}`}
                  >
                    {label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
