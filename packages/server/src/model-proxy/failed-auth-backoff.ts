/**
 * Per-source-IP exponential backoff for failed proxy auth attempts.
 *
 * Doubles from 10ms, caps at 10s. Resets on successful auth.
 * In-memory only — does not survive dashboard restart.
 *
 * See change: add-dashboard-model-proxy.
 */

interface BackoffEntry {
  count: number;
  lastFailureAt: number;
}

const BASE_DELAY_MS = 10;
const MAX_DELAY_MS = 10_000;

export class FailedAuthBackoff {
  private entries = new Map<string, BackoffEntry>();

  /** Record a failure. Returns the current delay in ms. */
  record(ip: string): number {
    const existing = this.entries.get(ip);
    const count = (existing?.count ?? 0) + 1;
    this.entries.set(ip, { count, lastFailureAt: Date.now() });
    return this.computeDelay(count);
  }

  /** Reset on successful auth. */
  reset(ip: string): void {
    this.entries.delete(ip);
  }

  /** Get current delay without mutation. Returns 0 if no failures recorded. */
  getDelayMs(ip: string): number {
    const entry = this.entries.get(ip);
    if (!entry) return 0;
    return this.computeDelay(entry.count);
  }

  private computeDelay(count: number): number {
    const delay = BASE_DELAY_MS * Math.pow(2, count - 1);
    return Math.min(delay, MAX_DELAY_MS);
  }
}
