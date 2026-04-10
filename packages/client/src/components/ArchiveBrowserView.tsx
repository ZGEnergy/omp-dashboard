import React, { useState, useCallback, useRef } from "react";
import { Icon } from "@mdi/react";
import { mdiArrowLeft, mdiMagnify } from "@mdi/js";
import { useArchiveListing, groupByDate, filterEntries } from "../hooks/useArchiveListing.js";
import { ArtifactLetters } from "./openspec-helpers.js";
import { MarkdownPreviewView } from "./MarkdownPreviewView.js";
import { useOpenSpecReader } from "../hooks/useOpenSpecReader.js";
import type { OpenSpecArtifact } from "@blackbelt-technology/pi-dashboard-shared/types.js";

interface Props {
  cwd: string;
  onBack: () => void;
}

/** Inner reader for an archived change — wraps useOpenSpecReader with archive flag. */
function ArchiveArtifactReader({
  cwd,
  changeName,
  initialArtifact,
  artifacts,
  onBack,
}: {
  cwd: string;
  changeName: string;
  initialArtifact: string;
  artifacts: OpenSpecArtifact[];
  onBack: () => void;
}) {
  const reader = useOpenSpecReader(cwd, changeName, initialArtifact, artifacts, true);
  return (
    <MarkdownPreviewView
      title={changeName}
      content={reader.content}
      isLoading={reader.isLoading}
      error={reader.error}
      tabs={reader.tabs}
      activeTab={reader.activeTab}
      onTabChange={reader.setActiveTab}
      onBack={onBack}
    />
  );
}

export function ArchiveBrowserView({ cwd, onBack }: Props) {
  const { entries, isLoading, error } = useArchiveListing(cwd);
  const [search, setSearch] = useState("");
  const [readerState, setReaderState] = useState<{
    changeName: string;
    artifactId: string;
    artifacts: OpenSpecArtifact[];
  } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const handleReadArtifact = useCallback((changeName: string, artifactId: string) => {
    // Find the entry to get its artifacts
    const entry = entries.find((e) => e.name === changeName);
    if (!entry) return;
    setReaderState({ changeName, artifactId, artifacts: entry.artifacts });
  }, [entries]);

  const handleBackFromReader = useCallback(() => {
    setReaderState(null);
  }, []);

  // Two-level navigation: if reader is open, show it; otherwise show list
  if (readerState) {
    return (
      <ArchiveArtifactReader
        cwd={cwd}
        changeName={readerState.changeName}
        initialArtifact={readerState.artifactId}
        artifacts={readerState.artifacts}
        onBack={handleBackFromReader}
      />
    );
  }

  const filtered = filterEntries(entries, search);
  const groups = groupByDate(filtered);

  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="archive-browser">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-secondary)]">
        <button
          onClick={onBack}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          data-testid="archive-back-btn"
        >
          <Icon path={mdiArrowLeft} size={0.8} />
        </button>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Archive
        </h2>
        <span className="text-[10px] text-[var(--text-muted)]">
          {entries.length} changes
        </span>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[var(--border-secondary)]">
        <Icon path={mdiMagnify} size={0.6} className="text-[var(--text-muted)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search archived changes..."
          className="flex-1 text-xs bg-transparent border-none outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          data-testid="archive-search-input"
        />
        {search && (
          <span className="text-[10px] text-[var(--text-muted)]">
            {filtered.length} matches
          </span>
        )}
      </div>

      {/* Content */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-2" data-testid="archive-list">
        {isLoading ? (
          <p className="text-xs text-[var(--text-muted)] py-4 text-center">Loading archive...</p>
        ) : error ? (
          <p className="text-xs text-red-400 py-4 text-center">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-4 text-center">
            {search ? "No matching entries" : "No archived changes"}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.date} className="mb-3" data-testid="archive-date-group">
              <div className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase mb-1">
                {group.date}
              </div>
              <div className="space-y-0.5">
                {group.entries.map((entry) => (
                  <div
                    key={entry.name}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer"
                    data-testid="archive-entry"
                    onClick={() => entry.artifacts.length > 0 && handleReadArtifact(entry.name, entry.artifacts[0].id)}
                  >
                    <span className="text-[11px] font-medium text-[var(--text-secondary)] truncate flex-1">
                      {entry.name.replace(/^\d{4}-\d{2}-\d{2}-/, "")}
                    </span>
                    <ArtifactLetters
                      artifacts={entry.artifacts}
                      changeName={entry.name}
                      onReadArtifact={handleReadArtifact}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
