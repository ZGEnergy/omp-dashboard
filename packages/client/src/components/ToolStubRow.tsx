import type { ToolCallStub } from "@blackbelt-technology/pi-dashboard-shared/replay-projection.js";

/** Human-readable byte size. `fullBytes` is the size NOT sent, so honesty matters. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Renders a tool call whose payload was degraded to a `ToolCallStub` — by
 * server hydration or by client eviction, indistinguishably.
 *
 * The row is self-describing: it never reads a sibling event. `fullBytes`
 * reports the size that was NOT loaded, so the row says "2.3 MB not loaded"
 * rather than implying the visible slice is the whole story.
 * See change: hydration-tool-stub-projection.
 */
export function ToolStubRow({
  stub,
  cached,
  loading,
  error,
  onFetch,
}: {
  stub: ToolCallStub;
  cached?: { payload: string; truncated: boolean };
  loading?: boolean;
  error?: boolean;
  onFetch?: () => void;
}) {
  const frame = "mx-4 border-l-2 border-[var(--border-secondary)] pl-3 py-1 text-xs";
  return (
    <div data-testid="tool-stub-row" className={frame}>
      <div className="text-[var(--text-secondary)] font-mono">{stub.argsSummary}</div>
      {cached ? (
        <>
          {/*
            Height-bounded on purpose. A fetched payload lives in the payload
            controller, not on the `ChatMessage`, so `computeRowTextChars` cannot
            see it — an unbounded <pre> could swap a ~20 KB estimate for up to
            2 MiB of real content and jump the virtualizer's scroll position.
            Capping the box keeps the pre-measure estimate honest.
            See change: hydration-tool-stub-projection.
          */}
          <pre
            data-testid="tool-stub-payload"
            className="whitespace-pre-wrap text-[var(--text-tertiary)] max-h-[480px] overflow-auto"
          >
            {cached.payload}
          </pre>
          {cached.truncated ? (
            <span data-testid="tool-stub-truncated" className="text-[var(--text-tertiary)]">
              response capped — open raw for the rest
            </span>
          ) : null}
        </>
      ) : (
        <>
          {stub.head ? <pre className="whitespace-pre-wrap text-[var(--text-tertiary)]">{stub.head}</pre> : null}
          {stub.tail ? (
            <>
              <div className="text-[var(--text-tertiary)]">…</div>
              <pre className="whitespace-pre-wrap text-[var(--text-tertiary)]">{stub.tail}</pre>
            </>
          ) : null}
          <div className="text-[var(--text-tertiary)]">
            {formatBytes(stub.fullBytes)} not loaded
            {onFetch ? (
              <button
                type="button"
                data-testid="tool-stub-load"
                disabled={loading}
                onClick={onFetch}
                className="ml-2 underline cursor-pointer hover:text-[var(--text-secondary)] disabled:cursor-default"
              >
                {loading ? "loading…" : "load"}
              </button>
            ) : null}
          </div>
          {error ? (
            <span data-testid="tool-stub-error" className="text-[var(--text-tertiary)]">
              could not load — retry
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}
