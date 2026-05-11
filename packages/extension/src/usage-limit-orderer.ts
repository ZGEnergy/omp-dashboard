/**
 * Usage-limit event orderer.
 *
 * Tracks per-session whether an `auto_retry_start` was forwarded without a
 * matching `auto_retry_end`, and — when an `agent_end` arrives whose terminal
 * assistant message has a usage-limit / quota errorMessage — synthesizes an
 * `auto_retry_end { success: false }` to emit BEFORE the `agent_end`.
 *
 * Pure logic (no I/O). The bridge wires this into its forwarding pipeline.
 *
 * See change: fix-provider-retry-infinite-loop.
 */

/**
 * Matches terminal billing/quota error categories observed in production
 * across providers. The orderer uses this to surface a synthesized
 * `auto_retry_end{success:false}` BEFORE the bridge forwards `agent_end`,
 * so the dashboard's `retryState` clears before `lastError` is set.
 *
 * Coverage (verified via fixture tests):
 *   - Codex / Anthropic / generic: usage_limit_reached, usage_not_included,
 *     quota_exceeded, credit_balance, insufficient_quota, monthly limit,
 *     daily limit, hourly limit, "reset after Nh|Nm|Ns".
 *   - Gemini / Google: "monthly spending cap", "spending cap",
 *     RESOURCE_EXHAUSTED.
 *   - Generic catch-all for "exceeded ... (quota|cap|spending)" within
 *     ~40 chars (avoids a string with no terminal-meaning context).
 *
 * See change: fix-retry-banner-stuck-on-limit-exceeded.
 */
export const USAGE_LIMIT_PATTERN =
  /usage[_ ]limit[_ ]reached|usage_not_included|insufficient_quota|credit[_ ]balance|quota[_ ]exceeded|resource[_ ]exhausted|monthly[_ ]limit|monthly[_ ]spending[_ ]cap|hourly[_ ]limit|daily[_ ]limit|spending[_ ]cap|exceeded[^"]{0,40}(quota|cap|spending)|reset after \d+[hms]/i;

export interface SyntheticEventEnvelope {
  eventType: "auto_retry_end";
  data: { success: false; attempt: -1; finalError: string };
}

export class UsageLimitOrderer {
  /** sessionId → true while a retry is in flight (no auto_retry_end seen yet). */
  private pending = new Set<string>();

  /**
   * Notify the orderer of an outbound `auto_retry_start` for sessionId.
   */
  noteRetryStart(sessionId: string): void {
    this.pending.add(sessionId);
  }

  /**
   * Notify the orderer of an outbound `auto_retry_end` for sessionId.
   * Subsequent `agent_end` events will not synthesize unless a new retry
   * has been started.
   */
  noteRetryEnd(sessionId: string): void {
    this.pending.delete(sessionId);
  }

  /**
   * Inspect an `agent_end` payload. If the terminal message has a
   * usage-limit error AND we have an unmatched retry-start for this session,
   * return the synthetic event the bridge should forward BEFORE the agent_end.
   *
   * Returns null when no synthesis is needed. Always clears the pending flag
   * after a terminal agent_end (errored or not) so we don't double-synthesize.
   */
  maybeSynthesize(
    sessionId: string,
    agentEndData: Record<string, unknown> | undefined,
  ): SyntheticEventEnvelope | null {
    const wasPending = this.pending.has(sessionId);
    // Always clear on agent_end: a terminal turn ends any retry tracking.
    this.pending.delete(sessionId);

    if (!wasPending || !agentEndData) return null;
    const messages = agentEndData.messages;
    if (!Array.isArray(messages) || messages.length === 0) return null;
    const last = messages[messages.length - 1] as Record<string, unknown> | undefined;
    if (!last || last.stopReason !== "error") return null;
    const errorMessage = typeof last.errorMessage === "string" ? last.errorMessage : "";
    if (!errorMessage || !USAGE_LIMIT_PATTERN.test(errorMessage)) return null;

    return {
      eventType: "auto_retry_end",
      data: { success: false, attempt: -1, finalError: errorMessage },
    };
  }

  /** Test-only: inspect pending state. */
  hasPending(sessionId: string): boolean {
    return this.pending.has(sessionId);
  }
}
