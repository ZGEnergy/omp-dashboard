/**
 * Pi-native follow-up queue panel (v2 cycling).
 *
 * Steer chips moved to inline-chat rendering in `ChatView` (v2). This panel
 * surfaces only the follow-up queue. In v2 the follow-up is a multi-entry
 * queue with ONE entry visible at a time and cycling controls:
 *
 *   ↑ prev   ↓ next   ⇧ promote-to-head
 *
 * Click the body to edit (Enter / blur saves, Esc cancels). ✕ removes the
 * currently-visible entry (not the whole queue). Clear-all is available
 * via `onClearFollowup` (still wired but currently no UI affordance in v2 —
 * users remove entries one at a time).
 *
 * Reads `Session.pendingQueues.followUp[]` populated by the server's
 * `queue_update` forward from the bridge's shadow queue.
 *
 * See capability `mid-turn-prompt-queue` / change `add-followup-edit-and-steer-cancel`.
 */
import { useState, useEffect, useRef } from "react";
import Icon from "@mdi/react";
import { mdiClose, mdiChevronUp, mdiChevronDown, mdiArrowUpBoldHexagonOutline } from "@mdi/js";

interface Props {
  /** The follow-up queue entries from `Session.pendingQueues.followUp` (v2 multi-entry). */
  followUp: string[];
  /** Wipe pi's follow-up queue entirely (rarely surfaced in v2 UI). */
  onClearFollowup: () => void;
  /** v1-compat: replace ALL entries with this single text. Deprecated in v2. */
  onEditFollowup: (text: string) => void;
  /** v2: replace entry at `index` with `text`. */
  onEditFollowupEntry?: (index: number, text: string) => void;
  /** v2: remove entry at `index`. */
  onRemoveFollowupEntry?: (index: number) => void;
  /** v2: move entry at `index` to position 0 (head). */
  onPromoteFollowupEntry?: (index: number) => void;
}

export function QueuePanel({
  followUp,
  onClearFollowup,
  onEditFollowup,
  onEditFollowupEntry,
  onRemoveFollowupEntry,
  onPromoteFollowupEntry,
}: Props) {
  const hasFollowUp = followUp.length > 0;
  if (!hasFollowUp) return null;

  return (
    <div
      data-testid="queue-panel"
      className="border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]/40 px-3 py-2 flex flex-col gap-2"
    >
      <FollowupCycler
        entries={followUp}
        onClearAll={onClearFollowup}
        onEditLegacy={onEditFollowup}
        onEditEntry={onEditFollowupEntry}
        onRemoveEntry={onRemoveFollowupEntry}
        onPromoteEntry={onPromoteFollowupEntry}
      />
    </div>
  );
}

function FollowupCycler({
  entries,
  onClearAll,
  onEditLegacy,
  onEditEntry,
  onRemoveEntry,
  onPromoteEntry,
}: {
  entries: string[];
  onClearAll: () => void;
  onEditLegacy: (text: string) => void;
  onEditEntry?: (index: number, text: string) => void;
  onRemoveEntry?: (index: number) => void;
  onPromoteEntry?: (index: number) => void;
}) {
  // currentIndex tracks which entry is visible. Initial: last entry (so the
  // user sees what they most recently queued). Subsequent appends advance to
  // the new last; removals clamp.
  const [currentIndex, setCurrentIndex] = useState(Math.max(0, entries.length - 1));
  const prevLenRef = useRef(entries.length);
  useEffect(() => {
    const len = entries.length;
    const prev = prevLenRef.current;
    prevLenRef.current = len;
    if (len === 0) {
      setCurrentIndex(0);
      return;
    }
    if (len > prev) {
      // Appended → jump to new last entry.
      setCurrentIndex(len - 1);
    } else if (currentIndex >= len) {
      // Shrunk past current → clamp to last valid index.
      setCurrentIndex(len - 1);
    }
  }, [entries.length, currentIndex]);

  const idx = Math.min(currentIndex, entries.length - 1);
  const text = entries[idx] ?? "";
  const total = entries.length;
  const canPrev = idx > 0;
  const canNext = idx < total - 1;
  const canPromote = total > 1 && idx > 0;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  useEffect(() => { if (!editing) setDraft(text); }, [text, editing]);

  const submit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== text) {
      if (onEditEntry) onEditEntry(idx, trimmed);
      else onEditLegacy(trimmed); // v1 fallback
    }
    setEditing(false);
  };
  const cancelEdit = () => { setDraft(text); setEditing(false); };

  const remove = () => {
    if (onRemoveEntry) onRemoveEntry(idx);
    else onClearAll(); // v1 fallback: no per-entry remove → clear all
  };
  const promote = () => {
    if (onPromoteEntry) onPromoteEntry(idx);
  };

  return (
    <div
      data-testid="queue-panel-followup"
      className="rounded-md border border-[var(--border-secondary)] bg-[var(--bg-secondary)]/40 px-3 py-2"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400/80" aria-hidden />
          Follow-up — delivered when agent finishes
          {total > 1 && (
            <span data-testid="queue-followup-position" className="ml-1 text-[var(--text-secondary)]">
              {idx + 1} of {total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => setCurrentIndex(idx - 1)}
                disabled={!canPrev}
                data-testid="queue-followup-prev"
                aria-label="Previous follow-up entry"
                title="Previous entry"
                className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <Icon path={mdiChevronUp} size={0.65} />
              </button>
              <button
                type="button"
                onClick={() => setCurrentIndex(idx + 1)}
                disabled={!canNext}
                data-testid="queue-followup-next"
                aria-label="Next follow-up entry"
                title="Next entry"
                className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <Icon path={mdiChevronDown} size={0.65} />
              </button>
              <button
                type="button"
                onClick={promote}
                disabled={!canPromote}
                data-testid="queue-followup-promote"
                aria-label="Promote this entry to next-in-queue"
                title="Promote to next-in-queue"
                className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <Icon path={mdiArrowUpBoldHexagonOutline} size={0.6} />
              </button>
            </>
          )}
          {!editing && (
            <button
              type="button"
              onClick={remove}
              data-testid="queue-followup-remove"
              aria-label="Remove this follow-up entry"
              title="Remove this entry"
              className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <Icon path={mdiClose} size={0.6} />
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <textarea
          data-testid="queue-followup-editor"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
          }}
          onBlur={submit}
          autoFocus
          rows={3}
          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-primary)] resize-y"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          data-testid="queue-followup-edit"
          aria-label="Edit follow-up"
          title="Click to edit"
          className="block w-full text-left text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words leading-relaxed cursor-text rounded px-1 -mx-1 py-0.5 hover:bg-[var(--bg-hover)]/50 transition-colors"
        >
          <span data-testid="queue-chip-followup">{text}</span>
        </button>
      )}
    </div>
  );
}
