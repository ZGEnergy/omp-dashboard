## MODIFIED Requirements

### Requirement: Retry banner in chat view

The dashboard SHALL surface in-flight provider retries via the unified `SessionBanner` component (see capability `session-status-banner`), rendered in the `retrying` variant when `SessionState.retryState` is set. The previous standalone `<RetryBanner>` component is REMOVED; banner placement moves from inside `ChatView` to sticky above the `CommandInput`.

In the `retrying` variant the banner SHALL display:

- Attempt phrasing. When `retryState.maxAttempts > 0` AND `retryState.delayMs > 0`, the phrasing SHALL include current attempt and max attempts plus a live countdown to `startedAt + delayMs`, refreshed at least once per second, never going below 0. When either is `<= 0` (sentinel — indeterminate retry; bridge does not know pi's retry settings), the banner SHALL show an indeterminate "retrying…" message instead.
- A "Stop retrying" button that triggers the same `wrappedHandleAbort` flow as the main Stop button.
- The original `reason` string, truncated to a single line with overflow ellipsis.

#### Scenario: Banner visible during retry with known countdown
- **WHEN** `retryState = { attempt: 2, maxAttempts: 3, delayMs: 4000, reason: "rate limit exceeded", startedAt: 1700000000000 }`
- **THEN** the unified `SessionBanner` SHALL be visible in the `retrying` variant
- **AND** the banner SHALL include text identifying attempt 2 of 3
- **AND** a "Stop retrying" button SHALL be rendered

#### Scenario: Banner shows indeterminate state when delayMs is sentinel -1
- **WHEN** `retryState = { attempt: 1, maxAttempts: -1, delayMs: -1, reason: "rate limit exceeded", startedAt: 0 }`
- **THEN** the banner SHALL be visible in the `retrying` variant
- **AND** the banner SHALL show "retrying…" without a countdown
- **AND** a "Stop retrying" button SHALL be rendered

#### Scenario: Banner countdown reaches zero and stays
- **WHEN** the banner is mounted with `startedAt + delayMs` already elapsed AND `delayMs > 0`
- **THEN** the displayed countdown SHALL be `0` (not negative)
- **AND** the banner SHALL remain visible until `retryState` is cleared

#### Scenario: Stop retrying button triggers abort
- **GIVEN** the banner is in `retrying` variant
- **WHEN** the user clicks "Stop retrying"
- **THEN** `wrappedHandleAbort()` SHALL be invoked for the selected session
- **AND** an `abort` message SHALL be sent for the current session
- **AND** the banner SHALL clear once `retryState` is cleared (typically within ≤200ms via the bridge's synthetic auto_retry_end)

#### Scenario: Banner clears on auto_retry_end
- **GIVEN** the banner is in `retrying` variant
- **WHEN** an `auto_retry_end` event arrives (success or failure)
- **THEN** the banner SHALL no longer render in the `retrying` variant
- **AND** the banner SHALL transition to `error` / `limit-exceeded` (if `lastError` is set) or `hidden`

### Requirement: Bridge synthesizes auto_retry_end on user abort

The bridge command handler SHALL synthesize and forward an `auto_retry_end` event immediately after invoking `cachedCtx.abort()` on receipt of an `abort` command. The synthesized event SHALL be forwarded via the existing `event_forward` wire shape so the dashboard can clear `retryState` optimistically.

The synthesized payload SHALL be `data: { success: false, attempt: -1 }` — `finalError` is OMITTED. The previous hardcoded `"Aborted by user"` placeholder is REMOVED. Rationale: when the orderer's pending flag survives user abort (see "Bridge persistent-abort scheduler closes retry race" and the wrapper-abort changes in `mid-turn-prompt-queue`), pi's terminal `agent_end` will surface the actual provider `errorMessage` via the orderer's natural synth path. The command-handler's immediate synth only needs to clear `retryState`, not invent a finalError that overwrites the truth.

The synthetic event SHALL be idempotent: subsequent synthesized or natural `auto_retry_end`s are no-ops in the reducer when `retryState` is already undefined.

#### Scenario: Abort during retry clears retryState within 200ms with no finalError
- **GIVEN** a session with `retryState` set
- **WHEN** the bridge receives `{ type: "abort", sessionId }`
- **THEN** the bridge SHALL invoke `cachedCtx.abort()`
- **AND** the bridge SHALL forward an `event_forward` whose `event.eventType === "auto_retry_end"` and `event.data` matches `{ success: false, attempt: -1 }`
- **AND** `event.data.finalError` SHALL NOT be present (or SHALL be `undefined`)
- **AND** `SessionState.lastError` SHALL NOT be set by this synth alone (the reducer only sets lastError when `typeof data.finalError === "string"`)

#### Scenario: Abort outside retry phase is harmless
- **GIVEN** a session with `retryState` undefined (e.g. mid-stream, not retrying)
- **WHEN** the bridge receives `abort`
- **THEN** the synthesized `auto_retry_end` SHALL still be forwarded
- **AND** the reducer SHALL ignore it (no-op per the auto_retry_end-without-retryState rule)

#### Scenario: Abort during retry surfaces real provider error via agent_end
- **GIVEN** a session with `retryState` set (reason: `"rate_limit_exceeded — usage_limit_reached"`)
- **AND** the orderer's `pending` flag is true for the session
- **WHEN** the user aborts AND pi subsequently emits `agent_end` with `messages[last].errorMessage === "usage_limit_reached: monthly cap"` AND `stopReason: "error"`
- **THEN** the synth-on-abort `auto_retry_end{success:false, attempt:-1}` (no finalError) SHALL clear `retryState` without setting `lastError`
- **AND** the bridge's `agent_end` handler SHALL invoke `usageLimitOrderer.maybeSynthesize()` which returns `{ finalError: "usage_limit_reached: monthly cap" }` (orderer pending was NOT cleared by wrapper-abort)
- **AND** the resulting synthesized `auto_retry_end` SHALL set `SessionState.lastError = { message: "usage_limit_reached: monthly cap", … }`
- **AND** the unified `SessionBanner` SHALL render in `limit-exceeded` variant carrying the real provider error

### Requirement: Bridge persistent-abort scheduler closes retry race

On receipt of `abort`, after invoking the full bridge wrapper-abort once synchronously (which calls `cachedCtx.abort()` and resets shadow queues — see `mid-turn-prompt-queue`), the bridge SHALL schedule additional **raw** `cachedCtx.abort()` calls at 200 ms intervals for up to 2 seconds. The scheduler SHALL stop on ANY of the following:

1. `cachedCtx.isIdle?.()` returns `true` (existing behavior).
2. The bridge's `isAgentStreaming` flag transitions from `true` (at scheduler start) to `false` (i.e. `agent_end` for the aborted turn has been processed).
3. 2 seconds total elapsed.

The scheduled tick SHALL invoke `cachedCtx.abort()` directly (via a `rawAbort` option exposed by the bridge to the command handler), NOT the full wrapper. This prevents the wrapper's recurring side-effects (re-clearing pi's queues, re-resetting bridge shadows, re-calling `retryTracker.noteAbort` / orderer ticks) from clobbering any user prompt that lands within the 2 s window. Only `cachedCtx.abort()` is repeated, matching the original intent of the spec (closing pi-coding-agent's `_retryAbortController` race window between sleep-end and the next `agent.continue()` call).

The scheduler SHALL cancel itself if the bridge is unloaded or a new session takes over.

#### Scenario: Persistent abort fires repeatedly until agent is idle, using rawAbort
- **GIVEN** the bridge receives `abort` while the agent is mid-retry
- **AND** `cachedCtx.isIdle()` returns false initially
- **AND** `isAgentStreaming` is `true` at scheduler start
- **THEN** the bridge SHALL call `cachedCtx.abort()` again at ~200 ms intervals
- **AND** the bridge SHALL NOT re-run the wrapper's queue-clearing logic on each tick
- **AND** SHALL stop calling once `cachedCtx.isIdle()` returns true OR `isAgentStreaming` flips to false OR after 2 s elapsed

#### Scenario: Persistent abort stops on streaming-false transition
- **GIVEN** the bridge has begun the persistent-abort schedule with `isAgentStreaming === true` at start
- **WHEN** `agent_end` arrives and the bridge flips `isAgentStreaming` to `false`
- **THEN** the next scheduler tick SHALL observe the transition AND clear the interval
- **AND** no further `cachedCtx.abort()` calls SHALL be made

#### Scenario: Persistent abort does not kill a user re-send within the window
- **GIVEN** the bridge has begun the persistent-abort schedule
- **AND** pi has settled the aborted turn (agent_end fired, `isAgentStreaming` is `false`)
- **WHEN** the user sends a new prompt within 1 s of the original abort
- **THEN** the scheduler SHALL have already stopped (per the streaming-transition break)
- **AND** the new prompt's resulting `agent_start` SHALL NOT be aborted by a leftover persistent-abort tick

#### Scenario: Persistent abort stops immediately when agent becomes idle
- **GIVEN** the bridge has just begun the persistent-abort schedule
- **WHEN** `cachedCtx.isIdle()` returns true on the next interval check
- **THEN** the scheduler SHALL stop without further `abort()` calls

## ADDED Requirements

### Requirement: Bridge auto-aborts session on USAGE_LIMIT_PATTERN match in message_end

When the bridge observes a `message_end` event whose `message.role === "assistant"`, `message.stopReason === "error"`, and `message.errorMessage` matches `USAGE_LIMIT_PATTERN` (imported from `packages/shared/src/error-patterns.ts`), the bridge SHALL:

1. Invoke `cachedCtx.abort()` synchronously — this prevents pi from entering its retry sleep for a terminal billing/quota error that will not resolve regardless of retry attempts.
2. Forward a synthesized `auto_retry_end { success: false, attempt: -1, finalError: <errorMessage> }` event. This routes the unified `SessionBanner` directly to the `limit-exceeded` variant carrying the real provider error.

The auto-abort SHALL run BEFORE the bridge's existing `retryTracker.observeMessageEnd` synth logic. If `RETRYABLE_PATTERN` would also have matched the same `errorMessage` (e.g. providers that emit `"429: usage_limit_reached"`), the `USAGE_LIMIT_PATTERN` branch wins and the retry chain SHALL NOT start.

#### Scenario: Terminal usage-limit error aborts immediately on message_end
- **WHEN** the bridge processes a `message_end` with `message: { role: "assistant", stopReason: "error", errorMessage: "monthly_spending_cap exceeded for project X" }`
- **THEN** the bridge SHALL invoke `cachedCtx.abort()` synchronously
- **AND** the bridge SHALL forward `event_forward { event: { eventType: "auto_retry_end", data: { success: false, attempt: -1, finalError: "monthly_spending_cap exceeded for project X" } } }`
- **AND** no synthesized `auto_retry_start` SHALL be emitted for this message_end
- **AND** the dashboard SHALL render the `limit-exceeded` variant

#### Scenario: Transient rate-limit still retries
- **WHEN** the bridge processes a `message_end` with `errorMessage: "429: rate_limit; try again in 30s"` (matches `RETRYABLE_PATTERN` but NOT `USAGE_LIMIT_PATTERN`)
- **THEN** the bridge SHALL NOT invoke `cachedCtx.abort()`
- **AND** the bridge SHALL synthesize and forward `auto_retry_start` as today
- **AND** the dashboard SHALL render the `retrying` variant

#### Scenario: Combined string (429 + usage_limit) hard-stops
- **WHEN** the bridge processes a `message_end` with `errorMessage: "429: usage_limit_reached — monthly quota"`
- **AND** the string matches BOTH `RETRYABLE_PATTERN` (via "429") AND `USAGE_LIMIT_PATTERN` (via "usage_limit_reached")
- **THEN** `USAGE_LIMIT_PATTERN` SHALL take precedence
- **AND** the bridge SHALL invoke `cachedCtx.abort()` AND forward the terminal `auto_retry_end{success:false, finalError}`

### Requirement: Bridge synthesizes auto_retry_end on agent_end USAGE_LIMIT match outside retry chain

When the bridge processes an `agent_end` event whose terminal assistant message has `stopReason: "error"` AND `errorMessage` matches `USAGE_LIMIT_PATTERN`, the bridge SHALL forward a synthesized `auto_retry_end { success: false, attempt: -1, finalError: <errorMessage> }` BEFORE forwarding the `agent_end` — **regardless of whether the orderer's pending flag is set**.

This extends the existing "Bridge usage-limit orderer cleans retry-banner → error-banner transition" requirement to also cover the first-attempt-terminal case (where no `auto_retry_start` was ever fired because `RETRYABLE_PATTERN` did not match). Without this requirement, first-attempt terminal billing errors would surface as the generic `error` banner variant instead of `limit-exceeded`.

The orderer's existing `maybeSynthesize` covers the case where a retry chain WAS in flight; this requirement covers the case where it WASN'T. The two paths SHALL be mutually exclusive (if `maybeSynthesize` returned a non-null synth, this branch SHALL NOT also fire).

#### Scenario: First-attempt terminal error routes to limit-exceeded variant
- **GIVEN** the orderer's `pending` flag is false for the session (no retry chain ever started)
- **WHEN** `agent_end` arrives with `messages[last]: { stopReason: "error", errorMessage: "insufficient_quota" }`
- **THEN** the bridge SHALL forward `event_forward { event: { eventType: "auto_retry_end", data: { success: false, attempt: -1, finalError: "insufficient_quota" } } }` BEFORE forwarding the `agent_end`
- **AND** the dashboard's `lastError` SHALL be set via the auto_retry_end arm to `"insufficient_quota"`
- **AND** the unified `SessionBanner` SHALL render the `limit-exceeded` variant

#### Scenario: Non-USAGE_LIMIT agent_end error does NOT route to limit-exceeded
- **GIVEN** the orderer's `pending` flag is false for the session
- **WHEN** `agent_end` arrives with `messages[last]: { stopReason: "error", errorMessage: "tool execution failed: file not found" }`
- **THEN** no synthesized `auto_retry_end` SHALL be emitted from this branch
- **AND** the existing `agent_end` reducer arm SHALL set `lastError` to `"tool execution failed: file not found"`
- **AND** the unified `SessionBanner` SHALL render the `error` variant (not `limit-exceeded`)

#### Scenario: When orderer.maybeSynthesize already fired, this branch does not double-fire
- **GIVEN** the orderer's `pending` flag was true (retry chain in flight)
- **WHEN** `agent_end` arrives with `errorMessage` matching `USAGE_LIMIT_PATTERN`
- **THEN** the bridge SHALL forward the orderer's synth (existing behavior)
- **AND** this new branch SHALL NOT additionally synthesize a second `auto_retry_end` for the same `agent_end`
