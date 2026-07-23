/**
 * Bounded hot-window observability report shared between client and server.
 *
 * `HotWindowReport` carries ONLY sizes/counts/labels describing the client's
 * bounded hot transcript state (ledger, persister, reducer, detail-pane).
 * It must NEVER carry transcript content — no message text, tool args,
 * images, or raw events. `sanitizeHotWindowReport` is the single choke point
 * that enforces this: every field is coerced to a bounded number or a fixed
 * enum/label, and any unknown key (e.g. a stray content field) is dropped.
 *
 * See change: bounded-hot-transcript-state (Slice 3, Task 3.1).
 */

/** Where the client derived its current hot-window state from. */
export type HydrationSource = "memory" | "cache" | "stream";

export interface HotWindowReport {
  sessionId: string;
  /** Estimated UTF-8 bytes retained in the in-memory replay ledger. */
  ledgerBytes: number;
  /** Event count retained in the in-memory replay ledger. */
  ledgerEvents: number;
  /** Estimated UTF-8 bytes buffered in the debounced replay-cache persister. */
  persisterBytes: number;
  /** Reducer message count. */
  messages: number;
  /** Reducer in-flight/finished tool-call count. */
  toolCalls: number;
  /** Reducer subagent count. */
  subagents: number;
  /** Reducer pending interactive-request count. */
  interactiveRequests: number;
  /** Estimated bytes rendered in the detail/inspector pane, if open. */
  detailBytes: number;
  /** Exact count of hot-window tool evictions observed so far (sum of each
   *  evicted-tool-burst's collapsed member count, not the burst count). */
  evictions: number;
  /** High-water mark of ledgerBytes observed for this session. */
  highWaterBytes: number;
  /** Wall-clock ms spent deriving this report (0 when not measured). */
  derivationMs: number;
  /** Where the current hot-window state was hydrated from. */
  hydrationSource: HydrationSource;
  /** Optional label naming what triggered a cold start, if any. */
  coldStartTrigger?: string;
}

const MAX_LABEL_LENGTH = 256;
const HYDRATION_SOURCES = new Set<HydrationSource>(["memory", "cache", "stream"]);

function boundedNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function boundedLabel(value: unknown, maxLength = MAX_LABEL_LENGTH): string {
  const s = typeof value === "string" ? value : "";
  return s.length > maxLength ? s.slice(0, maxLength) : s;
}

function boundedHydrationSource(value: unknown): HydrationSource {
  return typeof value === "string" && HYDRATION_SOURCES.has(value as HydrationSource)
    ? (value as HydrationSource)
    : "memory";
}

/**
 * Coerce an arbitrary input into a `HotWindowReport`: every field becomes a
 * bounded, non-negative number or a bounded/enum label. Unknown keys (e.g.
 * `messageText`, `toolArgs`, `rawEvent`) are dropped — it is structurally
 * impossible for transcript content to ride along.
 */
export function sanitizeHotWindowReport(input: unknown): HotWindowReport {
  const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  const report: HotWindowReport = {
    sessionId: boundedLabel(value.sessionId),
    ledgerBytes: boundedNumber(value.ledgerBytes),
    ledgerEvents: boundedNumber(value.ledgerEvents),
    persisterBytes: boundedNumber(value.persisterBytes),
    messages: boundedNumber(value.messages),
    toolCalls: boundedNumber(value.toolCalls),
    subagents: boundedNumber(value.subagents),
    interactiveRequests: boundedNumber(value.interactiveRequests),
    detailBytes: boundedNumber(value.detailBytes),
    evictions: boundedNumber(value.evictions),
    highWaterBytes: boundedNumber(value.highWaterBytes),
    derivationMs: boundedNumber(value.derivationMs),
    hydrationSource: boundedHydrationSource(value.hydrationSource),
  };

  if (typeof value.coldStartTrigger === "string") {
    report.coldStartTrigger = boundedLabel(value.coldStartTrigger);
  }

  return report;
}
