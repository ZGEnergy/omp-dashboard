import React, { useState, useEffect, useRef, useCallback } from "react";
import { browseDirectory } from "../lib/browse-api.js";
import type { BrowseResult, BrowseEntry } from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";

interface Props {
  initialPath?: string;
  onSelect: (path: string) => void;
  onCancel: () => void;
  rows?: number;
}

/**
 * Parse input value into the resolved parent directory and the partial filter text.
 * "/Users/robson/Pro" → { parent: "/Users/robson", partial: "Pro" }
 * "/Users/robson/"    → { parent: "/Users/robson", partial: "" }
 */
function parseInput(value: string): { parent: string; partial: string } {
  if (value.endsWith("/")) {
    const parent = value.slice(0, -1) || "/";
    return { parent, partial: "" };
  }
  const lastSlash = value.lastIndexOf("/");
  if (lastSlash < 0) return { parent: "/", partial: value };
  const parent = value.slice(0, lastSlash) || "/";
  const partial = value.slice(lastSlash + 1);
  return { parent, partial };
}

export function PathPicker({ initialPath, onSelect, onCancel, rows = 8 }: Props) {
  const [inputValue, setInputValue] = useState(initialPath ?? "");
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The currently fetched directory
  const fetchedDirRef = useRef<string | null>(null);

  const fetchDir = useCallback(async (dir?: string) => {
    if (dir && fetchedDirRef.current === dir) return;
    setLoading(true);
    setError(null);
    try {
      const result = await browseDirectory(dir);
      fetchedDirRef.current = result.current;
      setEntries(result.entries);
      setParentPath(result.parent);
      setHighlightIndex(-1);
      return result;
    } catch (err: any) {
      setError(err.message ?? "Failed to browse");
      setEntries([]);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch — if no initialPath, discover home dir from server
  useEffect(() => {
    if (initialPath) {
      const { parent } = parseInput(initialPath);
      fetchDir(parent);
    } else {
      fetchDir().then((result) => {
        if (result) {
          setInputValue(result.current + "/");
        }
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Parse current input
  const { parent: currentParent, partial } = parseInput(inputValue);

  // Filter entries by partial (case-insensitive prefix)
  const filtered = partial
    ? entries.filter((e) => e.name.toLowerCase().startsWith(partial.toLowerCase()))
    : entries;

  // Build display list: [.., ...filtered entries]
  const showDotDot = parentPath !== null;
  const displayItems: Array<{ type: "parent" } | { type: "entry"; entry: BrowseEntry }> = [];
  if (showDotDot) displayItems.push({ type: "parent" });
  for (const entry of filtered) {
    displayItems.push({ type: "entry", entry });
  }

  // When input changes, check if we need to fetch a new directory
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    setHighlightIndex(-1);

    const { parent } = parseInput(value);
    if (parent !== fetchedDirRef.current) {
      fetchDir(parent);
    }
  };

  const descendInto = (dirPath: string) => {
    const newValue = dirPath + "/";
    setInputValue(newValue);
    setHighlightIndex(-1);
    fetchedDirRef.current = null; // force re-fetch
    fetchDir(dirPath);
  };

  const handleItemClick = (item: (typeof displayItems)[0]) => {
    if (item.type === "parent" && parentPath) {
      descendInto(parentPath);
    } else if (item.type === "entry") {
      descendInto(item.entry.path);
    }
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, displayItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Tab") {
      e.preventDefault();
      // If highlight is on an item, descend into it
      if (highlightIndex >= 0 && highlightIndex < displayItems.length) {
        handleItemClick(displayItems[highlightIndex]);
      } else if (filtered.length === 1) {
        // Single match auto-complete
        descendInto(filtered[0].path);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      onSelect(inputValue);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll("[role='option']");
    items[highlightIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [highlightIndex]);

  const rowHeight = 32; // px per row
  const listHeight = rows * rowHeight;

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="text"
        role="textbox"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        className="w-full bg-[var(--bg-tertiary)] rounded px-3 py-2 text-sm border border-[var(--border-secondary)] focus:border-blue-500 focus:outline-none font-mono"
        autoFocus
      />
      <div
        ref={listRef}
        className="overflow-y-auto border border-[var(--border-secondary)] rounded bg-[var(--bg-tertiary)]"
        style={{ height: listHeight }}
        role="listbox"
      >
        {loading && (
          <div className="px-3 py-2 text-sm text-[var(--text-secondary)]">Loading…</div>
        )}
        {error && (
          <div className="px-3 py-2 text-sm text-red-400">{error}</div>
        )}
        {!loading && !error && (
          <>
            {displayItems.map((item, i) => {
              const isHighlighted = i === highlightIndex;
              if (item.type === "parent") {
                return (
                  <div
                    key=".."
                    role="option"
                    aria-selected={isHighlighted}
                    className={`px-3 py-1 text-sm cursor-pointer flex items-center gap-2 ${
                      isHighlighted ? "bg-blue-600/30" : "hover:bg-[var(--bg-secondary)]"
                    }`}
                    onClick={() => handleItemClick(item)}
                  >
                    <span className="text-[var(--text-secondary)]">⬆</span>
                    <span>..</span>
                  </div>
                );
              }
              const { entry } = item;
              return (
                <div
                  key={entry.name}
                  role="option"
                  aria-selected={isHighlighted}
                  className={`px-3 py-1 text-sm cursor-pointer flex items-center gap-2 ${
                    isHighlighted ? "bg-blue-600/30" : "hover:bg-[var(--bg-secondary)]"
                  }`}
                  onClick={() => handleItemClick(item)}
                >
                  <span className="text-[var(--text-secondary)]">📁</span>
                  <span className="flex-1 truncate">{entry.name}</span>
                  {entry.isGit && (
                    <span className="text-xs text-green-400" title="git repo">git</span>
                  )}
                  {entry.isPi && (
                    <span className="text-xs text-cyan-400" title="pi project">pi</span>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && entries.length === 0 && (
              <div className="px-3 py-2 text-sm text-[var(--text-secondary)]">No subdirectories</div>
            )}
            {displayItems.length === (showDotDot ? 1 : 0) && filtered.length === 0 && entries.length > 0 && (
              <div className="px-3 py-2 text-sm text-[var(--text-secondary)]">No matches</div>
            )}
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
        >
          Cancel
        </button>
        <button
          onClick={() => inputValue.trim() && onSelect(inputValue)}
          disabled={!inputValue.trim()}
          className="px-4 py-2 rounded text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
        >
          Select
        </button>
      </div>
    </div>
  );
}
