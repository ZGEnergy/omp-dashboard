/**
 * Process-local aggregate of client-reported `HotWindowReport` frames.
 *
 * `ingest` re-runs `sanitizeHotWindowReport` (see
 * `@blackbelt-technology/pi-dashboard-shared/hot-window-metrics.js`) itself
 * before storing anything, so this module is content-free by construction —
 * it does not rely on the caller having sanitized first (sanitizing is
 * idempotent, so a caller that already sanitized pays a cheap no-op). Folds
 * the sanitized report into a bounded, content-free aggregate: the newest
 * `capacity` reports (newest-first, mirrors `HydrationMetrics.snapshot()`)
 * plus running high-water marks across ALL reports ever ingested (not just
 * the retained window). No transcript content ever passes through this
 * module — it only ever sees the whitelisted numeric/label fields of
 * `HotWindowReport`.
 *
 * Process-local, no persistence. Shared between `browser-gateway.ts` (ingests
 * on `hot_window_report`) and the `/api/health` route (reads `snapshot()`).
 *
 * See change: bounded-hot-transcript-state (Slice 3, Task 3.2).
 */
import {
  type HotWindowReport,
  sanitizeHotWindowReport,
} from "@blackbelt-technology/pi-dashboard-shared/hot-window-metrics.js";

export interface HotWindowReportEntry extends HotWindowReport {
  /** Epoch ms when the server ingested this report. */
  receivedAt: number;
}

export interface HotWindowMetricsSnapshot {
  /** Most-recent-first, capped at capacity. */
  reports: HotWindowReportEntry[];
  /** Running high-water mark of `ledgerBytes`/`highWaterBytes` across all reports ever ingested. */
  highWaterBytes: number;
  /** Running high-water marks of reducer counts across all reports ever ingested. */
  maxMessages: number;
  maxToolCalls: number;
  maxSubagents: number;
  maxInteractiveRequests: number;
  /**
   * Sum of `evictions` across all reports ever ingested. Each report's
   * `evictions` field is the exact tool-eviction count (sum of every
   * evicted-tool-burst's collapsed member count), so this total is exact.
   */
  totalEvictions: number;
  /** Count of reports ingested since boot (including ones since evicted from `reports`). */
  totalReports: number;
}

export interface HotWindowMetrics {
  ingest(report: HotWindowReport): void;
  /** Returns a fresh, bounded, content-free snapshot. */
  snapshot(): HotWindowMetricsSnapshot;
}

export function createHotWindowMetrics(capacity: number): HotWindowMetrics {
  // Guard non-finite/invalid input so the eviction check below always runs;
  // otherwise `buf.length > NaN` is always false and the buffer grows unbounded.
  const cap = Number.isFinite(capacity) ? Math.max(1, Math.floor(capacity)) : 1;
  const buf: HotWindowReportEntry[] = [];
  let highWaterBytes = 0;
  let maxMessages = 0;
  let maxToolCalls = 0;
  let maxSubagents = 0;
  let maxInteractiveRequests = 0;
  let totalEvictions = 0;
  let totalReports = 0;

  return {
    ingest(report: HotWindowReport): void {
      // Re-sanitize here (idempotent) so this module is content-free by
      // construction, not just by caller discipline — see module doc comment.
      const sanitized = sanitizeHotWindowReport(report);

      totalReports++;
      highWaterBytes = Math.max(highWaterBytes, sanitized.highWaterBytes, sanitized.ledgerBytes);
      maxMessages = Math.max(maxMessages, sanitized.messages);
      maxToolCalls = Math.max(maxToolCalls, sanitized.toolCalls);
      maxSubagents = Math.max(maxSubagents, sanitized.subagents);
      maxInteractiveRequests = Math.max(maxInteractiveRequests, sanitized.interactiveRequests);
      totalEvictions += sanitized.evictions;

      buf.push({ ...sanitized, receivedAt: Date.now() });
      if (buf.length > cap) buf.shift();
    },
    snapshot(): HotWindowMetricsSnapshot {
      return {
        // Newest-first copy so callers can't mutate the internal buffer.
        reports: buf.slice().reverse(),
        highWaterBytes,
        maxMessages,
        maxToolCalls,
        maxSubagents,
        maxInteractiveRequests,
        totalEvictions,
        totalReports,
      };
    },
  };
}
