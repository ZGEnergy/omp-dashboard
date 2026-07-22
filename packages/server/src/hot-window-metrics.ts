/**
 * Process-local aggregate of client-reported `HotWindowReport` frames.
 *
 * Ingests already-sanitized reports (see `sanitizeHotWindowReport` in
 * `@blackbelt-technology/pi-dashboard-shared/hot-window-metrics.js`) and folds
 * them into a bounded, content-free aggregate: the newest `capacity` reports
 * (newest-first, mirrors `HydrationMetrics.snapshot()`) plus running
 * high-water marks across ALL reports ever ingested (not just the retained
 * window). No transcript content ever passes through this module — it only
 * ever sees the already-whitelisted numeric/label fields of `HotWindowReport`.
 *
 * Process-local, no persistence. Shared between `browser-gateway.ts` (ingests
 * on `hot_window_report`) and the `/api/health` route (reads `snapshot()`).
 *
 * See change: bounded-hot-transcript-state (Slice 3, Task 3.2).
 */
import type { HotWindowReport } from "@blackbelt-technology/pi-dashboard-shared/hot-window-metrics.js";

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
   * `evictions` field is itself a PROXY (evicted tool-burst count), not an
   * exact eviction count — treat this total as a proxy too, not a precise count.
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
      totalReports++;
      highWaterBytes = Math.max(highWaterBytes, report.highWaterBytes, report.ledgerBytes);
      maxMessages = Math.max(maxMessages, report.messages);
      maxToolCalls = Math.max(maxToolCalls, report.toolCalls);
      maxSubagents = Math.max(maxSubagents, report.subagents);
      maxInteractiveRequests = Math.max(maxInteractiveRequests, report.interactiveRequests);
      totalEvictions += report.evictions;

      buf.push({ ...report, receivedAt: Date.now() });
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
