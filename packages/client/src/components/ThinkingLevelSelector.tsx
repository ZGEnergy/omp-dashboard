import React, { useState, useRef, useEffect } from "react";
import { Icon } from "@mdi/react";
import { mdiHeadLightbulb } from "@mdi/js";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

interface Props {
  current?: string;
  onSelect: (level: string) => void;
}

export function ThinkingLevelSelector({ current, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative" data-testid="thinking-level-selector">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
        data-testid="thinking-level-button"
      >
        <span className="font-mono truncate flex items-center gap-1"><Icon path={mdiHeadLightbulb} size={0.5} /> {current ?? "off"}</span>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-32 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded-lg shadow-lg z-50 overflow-hidden" data-testid="thinking-level-dropdown">
          <div className="max-h-48 overflow-y-auto">
            {THINKING_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => {
                  onSelect(level);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 md:py-1.5 min-h-[44px] md:min-h-0 text-xs font-mono hover:bg-[var(--bg-tertiary)] transition-colors ${
                  level === current ? "text-[var(--accent)] font-bold" : "text-[var(--text-secondary)]"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
