## MODIFIED Requirements

### Requirement: Error banner in chat view

Terminal errors SHALL be surfaced via the unified `SessionBanner` component (see capability `session-status-banner`). The previous `ErrorBanner` component and the inline `lastError` block in `ChatView` are REMOVED. The banner SHALL render in the `error` variant for generic terminal errors (whose `lastError.message` does NOT match `USAGE_LIMIT_PATTERN`) and in the `limit-exceeded` variant for terminal billing/quota errors.

The unified banner SHALL preserve the user-facing capabilities of the prior `ErrorBanner`:

- Display of the error message with truncation+toggle on long strings (default threshold 240 characters).
- Copy-to-clipboard control writing the full untruncated `lastError.message` via `navigator.clipboard.writeText`.
- Dismiss action that clears `SessionState.lastError`.
- Retry action (on the `error` variant only — NOT on `limit-exceeded`) that re-sends the last user-authored prompt for the session via `send_prompt`.

The `data-testid` attributes `error-banner` and `error-banner-dismiss` SHALL be preserved on the `SessionBanner` element when rendered in `error` or `limit-exceeded` variant, so existing integration tests continue to work.

#### Scenario: Error banner shown after non-billing terminal error
- **WHEN** `SessionState.lastError` is set with a message that does NOT match `USAGE_LIMIT_PATTERN` (e.g. `"tool execution failed"`)
- **THEN** the unified `SessionBanner` SHALL be visible in `error` variant
- **AND** the banner SHALL include a Retry and a Dismiss action
- **AND** the DOM element SHALL carry `data-testid="error-banner"`

#### Scenario: Limit-exceeded banner shown after USAGE_LIMIT terminal error
- **WHEN** `SessionState.lastError` is set with a message matching `USAGE_LIMIT_PATTERN` (e.g. `"monthly_spending_cap"`)
- **THEN** the unified `SessionBanner` SHALL be visible in `limit-exceeded` variant
- **AND** the banner SHALL NOT include a Retry action
- **AND** the banner SHALL include a Dismiss action
- **AND** the banner SHALL display a "Session stopped automatically." hint
- **AND** the DOM element SHALL carry `data-testid="error-banner"`

#### Scenario: Error banner dismissed by user
- **WHEN** the user clicks the dismiss button (`data-testid="error-banner-dismiss"`)
- **THEN** `lastError` SHALL be cleared and the banner SHALL transition to `hidden`

#### Scenario: Error banner auto-clears on new turn
- **WHEN** a new `agent_start` event arrives
- **THEN** `lastError` SHALL be cleared by the reducer (existing behavior)
- **AND** the unified banner SHALL transition to `hidden`

#### Scenario: Error message is copyable
- **WHEN** the unified banner is visible in `error` or `limit-exceeded` variant
- **THEN** a copy control SHALL be present that writes the full untruncated `lastError.message` to the clipboard via `navigator.clipboard.writeText`

### Requirement: Retry action on error banner

The unified `SessionBanner` SHALL render a Retry control ONLY in the `error` variant (NOT in `limit-exceeded`). Clicking Retry SHALL re-send the last user-authored prompt for the session via a `send_prompt` message (text + images), so an alive-but-errored session re-runs the same input that originally triggered the failure.

The retried user message SHALL be visually deduplicated in the chat view per the "Manual retry hides duplicate user bubble in chat view" requirement in `session-status-banner`.

The host view SHALL identify the last user-authored message via a helper that walks `state.messages` newest-to-oldest and returns the first user message's `text` and `images`. When no user message exists in history, the Retry button MAY be hidden or be a no-op.

#### Scenario: Retry button re-sends last user prompt and dedupes bubble
- **GIVEN** the unified banner is visible in `error` variant for a session with `lastError` set
- **AND** the session history contains [user("please refactor X"), assistant(error)]
- **AND** a retry handler is wired in App.tsx
- **WHEN** the user clicks the Retry button
- **THEN** a `send_prompt` message SHALL be sent with `text: "please refactor X"`
- **AND** when the resulting `message_start { role: "user", content: "please refactor X" }` event arrives
- **AND** the chat view SHALL render only ONE "please refactor X" user bubble (the new one flagged `retriedFrom` is hidden, OR the old one stays and the new one is hidden — implementation choice as long as exactly one renders)
- **AND** the resulting `agent_start` SHALL clear `lastError` and `retryState`

#### Scenario: Retry button absent in limit-exceeded variant
- **WHEN** the unified banner is in `limit-exceeded` variant
- **THEN** no Retry button SHALL be rendered in the DOM
- **AND** no `onRetry` callback SHALL be invocable from the banner

#### Scenario: Retry button hidden when no handler is provided
- **WHEN** the unified banner is rendered in `error` variant without an `onRetry` callback
- **THEN** no Retry button SHALL be rendered

#### Scenario: Retry button no-op when no prior user prompt exists
- **GIVEN** the unified banner is visible in `error` variant for a session whose history contains no user-authored messages
- **WHEN** the user clicks the Retry button
- **THEN** no `send_prompt` SHALL be sent
- **AND** the banner SHALL remain visible

### Requirement: Error extraction from agent_end events

The event reducer SHALL inspect `agent_end` events for error information. When `data.messages` contains a final assistant message with `stopReason === "error"`, the reducer SHALL set `lastError` on `SessionState` with the `errorMessage` value and the event timestamp.

`lastError` SHALL be set primarily via two paths:

1. **`agent_end` extractor (existing)**: when pi-coding-agent has fully exhausted its auto-retry attempts AND the terminal assistant message reaches `agent_end` with `stopReason: "error"` AND a non-empty `errorMessage`.

2. **`auto_retry_end` arm with `finalError` (existing, broadened)**: when the bridge forwards a synthesized `auto_retry_end { success: false, finalError: <string> }` AND `SessionState.lastError` is currently undefined. This now covers three bridge-side synth sources:
   - Orderer's `maybeSynthesize` ordering before terminal `agent_end` (existing).
   - Auto-stop on `USAGE_LIMIT_PATTERN` match in `message_end` (NEW — see `provider-retry-state`).
   - First-attempt terminal-limit branch on `agent_end` (NEW — see `provider-retry-state`).

The command-handler's synth on user abort no longer carries a `finalError` field (the `"Aborted by user"` placeholder is REMOVED). Subsequent `agent_end` events surface the real provider error via path (1) when pi emits `stopReason: "error"` with the real `errorMessage`.

Transient retryable errors that pi-coding-agent retries internally SHALL NOT set `lastError`; they are surfaced via `SessionState.retryState` instead (see `provider-retry-state`).

#### Scenario: LLM provider returns quota exceeded error after retries exhausted
- **WHEN** an `agent_end` event arrives with the last message having `stopReason: "error"` and `errorMessage: "Rate limit exceeded"`
- **THEN** `SessionState.lastError` SHALL be set to `{ message: "Rate limit exceeded", timestamp: <event timestamp> }`
- **AND** `SessionState.status` SHALL be `"idle"`
- **AND** `SessionState.isStreaming` SHALL be `false`
- **AND** `SessionState.retryState` SHALL be cleared

#### Scenario: agent_end without error
- **WHEN** an `agent_end` event arrives with the last message having `stopReason: "end_turn"` (normal completion)
- **THEN** `SessionState.lastError` SHALL remain unchanged (not set)

#### Scenario: agent_end with missing or empty messages array
- **WHEN** an `agent_end` event arrives with no `messages` array or an empty array
- **THEN** `SessionState.lastError` SHALL remain unchanged (defensive fallback)

#### Scenario: USAGE_LIMIT_PATTERN message_end auto-stop sets lastError via synth
- **WHEN** the bridge processes a `message_end` with `errorMessage: "usage_limit_reached"`
- **AND** the bridge synthesizes `auto_retry_end { success: false, attempt: -1, finalError: "usage_limit_reached" }` (per `provider-retry-state` auto-abort requirement)
- **AND** `SessionState.lastError` is currently undefined
- **THEN** the reducer's `auto_retry_end` arm SHALL set `SessionState.lastError = { message: "usage_limit_reached", timestamp: <event.timestamp> }`
- **AND** the unified `SessionBanner` SHALL render in `limit-exceeded` variant

#### Scenario: First-attempt USAGE_LIMIT agent_end synth sets lastError early
- **WHEN** the orderer's pending flag is false (no retry chain) AND `agent_end` arrives with `errorMessage: "credit_balance too low"`
- **AND** the bridge's first-attempt-terminal branch synthesizes `auto_retry_end { success: false, finalError: "credit_balance too low" }` before forwarding `agent_end`
- **THEN** the reducer's `auto_retry_end` arm SHALL set `lastError = { message: "credit_balance too low", … }` (assuming lastError was undefined)
- **AND** the subsequent `agent_end` extractor SHALL also see `stopReason: "error"` AND attempt to overwrite, but the existing "finalError does not overwrite existing lastError" rule (kept) means the value stays consistent
- **AND** the unified `SessionBanner` SHALL render in `limit-exceeded` variant

#### Scenario: User abort no longer sets lastError to "Aborted by user"
- **WHEN** the user aborts a retry-in-flight session
- **AND** the bridge synthesizes `auto_retry_end { success: false, attempt: -1 }` with NO `finalError`
- **THEN** `SessionState.lastError` SHALL NOT be set by this synth (reducer requires `typeof data.finalError === "string"`)
- **AND** if pi subsequently emits `agent_end` with a real provider `errorMessage`, `lastError` SHALL be set to that real message
- **AND** if pi does not emit `agent_end` with `stopReason: "error"`, `lastError` SHALL remain undefined and the unified banner SHALL transition to `hidden`

#### Scenario: auto_retry_end with finalError populates lastError early when undefined
- **WHEN** `SessionState.lastError` is undefined
- **AND** an `auto_retry_end` event arrives with `data: { success: false, finalError: "Rate limit exceeded" }`
- **THEN** `SessionState.lastError` SHALL be set to `{ message: "Rate limit exceeded", timestamp: <event.timestamp> }`

#### Scenario: auto_retry_end finalError does not overwrite existing lastError
- **WHEN** `SessionState.lastError` is already set to a previous error
- **AND** an `auto_retry_end` event arrives with `success: false` and a `finalError`
- **THEN** `SessionState.lastError` SHALL NOT be overwritten

## REMOVED Requirements

### Requirement: Long error messages collapse with toggle
**Reason**: Moved into the unified `SessionBanner` component spec (capability `session-status-banner`). The truncation+toggle behavior is preserved in the new component; the requirement now lives there.
**Migration**: Tests targeting `ErrorBanner` truncation behavior MUST update to target `SessionBanner` in `error` or `limit-exceeded` variant. The default threshold (240 characters) and `Show more` / `Show less` labels are unchanged.
