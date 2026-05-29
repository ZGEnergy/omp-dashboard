# session-status-banner Specification

## Purpose

Unified single-banner component (`SessionBanner`) for per-session retry/error/limit state, mounted sticky above the `CommandInput`. Replaces the prior split `<RetryBanner>` + inline-`lastError` block in `ChatView`. Variant derived by a pure selector over `SessionState`.

## Requirements

### Requirement: Single banner component with three variants

The dashboard SHALL render exactly one banner component (`SessionBanner`) per selected session, mounted sticky above the `CommandInput` (between `ChatView` and `CommandInput`), with the variant derived from a single selector over `SessionState`. Two banners SHALL NEVER be visible simultaneously for the same session.

The banner SHALL support exactly three visible variants and one hidden state:

- **`retrying`** (amber/yellow palette): shown while `SessionState.retryState` is set. Displays attempt count, indeterminate or determinate countdown, `retryState.reason` truncated to one line, and a "Stop retrying" action.
- **`error`** (red palette): shown while `SessionState.lastError` is set AND `lastError.message` does NOT match `USAGE_LIMIT_PATTERN`. Displays the error message (with the existing collapse-on-long-message behavior), a copy-to-clipboard control, a "Retry" action (when a retry handler is supplied), and a "Dismiss" action.
- **`limit-exceeded`** (red palette, distinct iconography 💳 or equivalent): shown while `SessionState.lastError` is set AND `lastError.message` matches `USAGE_LIMIT_PATTERN`. Displays the error message, copy control, "Dismiss" action, and a "Session stopped automatically." hint. Retry action SHALL NOT be rendered (the underlying error is terminal — retrying would just re-trip it).
- **`hidden`**: nothing rendered.

Precedence order: `retrying` wins over both error variants when both `retryState` and `lastError` are non-null (retry is in-progress, error is settled). Within the error variants, the `USAGE_LIMIT_PATTERN` test decides.

#### Scenario: retrying variant rendered when retryState set
- **WHEN** `SessionState.retryState = { attempt: 2, maxAttempts: -1, delayMs: -1, reason: "rate_limit_exceeded", startedAt: 0 }`
- **AND** `SessionState.lastError` is undefined
- **THEN** the `SessionBanner` SHALL render the `retrying` variant
- **AND** the banner SHALL display attempt 2
- **AND** the banner SHALL display the reason "rate_limit_exceeded"
- **AND** the banner SHALL render a "Stop retrying" button

#### Scenario: error variant rendered for generic terminal error
- **WHEN** `SessionState.lastError = { message: "fetch failed: ECONNRESET", timestamp: 1700000000000 }`
- **AND** `SessionState.retryState` is undefined
- **THEN** the `SessionBanner` SHALL render the `error` variant
- **AND** the banner SHALL display the error message
- **AND** the banner SHALL render a "Retry" button when an `onRetry` handler is supplied
- **AND** the banner SHALL render a "Dismiss" button

#### Scenario: limit-exceeded variant rendered for USAGE_LIMIT_PATTERN match
- **WHEN** `SessionState.lastError = { message: "monthly_spending_cap exceeded", timestamp: 1700000000000 }`
- **AND** `SessionState.retryState` is undefined
- **THEN** the `SessionBanner` SHALL render the `limit-exceeded` variant
- **AND** the banner SHALL NOT render a "Retry" button
- **AND** the banner SHALL render a "Dismiss" button
- **AND** the banner SHALL display a "Session stopped automatically." hint

#### Scenario: retrying wins over error when both set
- **WHEN** `SessionState.retryState` is set AND `SessionState.lastError` is also set
- **THEN** the `SessionBanner` SHALL render the `retrying` variant
- **AND** the `error` / `limit-exceeded` variants SHALL NOT be visible

#### Scenario: hidden when neither field is set
- **WHEN** `SessionState.retryState` is undefined AND `SessionState.lastError` is undefined
- **THEN** the `SessionBanner` SHALL render nothing (no DOM)

### Requirement: Banner-state selector is a pure function

A helper `deriveBannerState(state: SessionState): BannerState` SHALL be exported from `packages/client/src/lib/event-reducer.ts`. The selector SHALL be pure (no side effects, deterministic on its input) and SHALL be the sole determinant of which variant the `SessionBanner` renders. The host component SHALL NOT compute variant or precedence inline.

The selector's return shape:

```ts
type BannerState =
  | { variant: "hidden" }
  | { variant: "retrying"; attempt: number; reason: string }
  | { variant: "error"; message: string }
  | { variant: "limit-exceeded"; message: string };
```

`USAGE_LIMIT_PATTERN` SHALL be imported from `packages/shared/src/error-patterns.ts` (see "Shared error-pattern module" requirement below).

#### Scenario: Selector returns hidden for empty state
- **WHEN** `deriveBannerState({ retryState: undefined, lastError: undefined, … })` is called
- **THEN** the return SHALL be `{ variant: "hidden" }`

#### Scenario: Selector returns retrying with attempt and reason
- **WHEN** `deriveBannerState({ retryState: { attempt: 3, maxAttempts: -1, delayMs: -1, reason: "rate limit", startedAt: 0 }, lastError: undefined, … })` is called
- **THEN** the return SHALL be `{ variant: "retrying", attempt: 3, reason: "rate limit" }`

#### Scenario: Selector returns limit-exceeded for USAGE_LIMIT_PATTERN match
- **WHEN** `deriveBannerState({ retryState: undefined, lastError: { message: "quota_exceeded for org x", timestamp: 1 }, … })` is called
- **THEN** the return SHALL be `{ variant: "limit-exceeded", message: "quota_exceeded for org x" }`

#### Scenario: Selector returns error for non-USAGE_LIMIT_PATTERN message
- **WHEN** `deriveBannerState({ retryState: undefined, lastError: { message: "network error: socket hang up", timestamp: 1 }, … })` is called
- **THEN** the return SHALL be `{ variant: "error", message: "network error: socket hang up" }`

### Requirement: Banner mounts sticky above CommandInput

`SessionBanner` SHALL be mounted in the layout tree between `ChatView` and `CommandInput` (not inside `ChatView`). The banner SHALL NOT scroll with chat content. It SHALL occupy a single row of vertical space and SHALL collapse to zero height when in `hidden` variant.

The legacy `RetryBanner.tsx` component SHALL be removed. The inline `lastError` red-banner block previously rendered inside `ChatView.tsx` SHALL be removed. No code path SHALL render two banner components for the same session.

#### Scenario: Banner appears above CommandInput in the DOM tree
- **WHEN** the dashboard renders for a session with `retryState` set
- **THEN** the `SessionBanner` element SHALL appear in the DOM between the chat scroll container and the `CommandInput` element

#### Scenario: Banner does not scroll with chat
- **WHEN** the user scrolls through chat history
- **AND** `retryState` or `lastError` is set
- **THEN** the `SessionBanner` SHALL remain visible regardless of chat scroll position

#### Scenario: Legacy RetryBanner is removed
- **WHEN** searching for `RetryBanner` component imports across `packages/client/`
- **THEN** no production code path SHALL import or render `RetryBanner`

### Requirement: Banner actions dispatch through existing handlers

The "Stop retrying" action on the `retrying` variant SHALL invoke the same `wrappedHandleAbort` callback that the existing `Stop` button uses (snapshotting queues into draft before dispatching the WS `abort`).

The "Retry" action on the `error` variant SHALL invoke the same `onRetryAfterError` callback that the existing inline error banner used: re-sends `findLastUserPrompt(state.messages)` via `send_prompt` to the session.

The "Dismiss" action SHALL clear `SessionState.lastError` via the same `onDismissError` callback used by the previous inline error banner.

#### Scenario: Stop retrying triggers abort
- **GIVEN** the banner is in `retrying` variant
- **WHEN** the user clicks "Stop retrying"
- **THEN** the client SHALL invoke `wrappedHandleAbort()` for the selected session
- **AND** the queue-text-into-draft restoration SHALL fire as today

#### Scenario: Retry on error variant resends last prompt
- **GIVEN** the banner is in `error` variant
- **AND** the chat history contains a user message "fix the bug"
- **WHEN** the user clicks "Retry"
- **THEN** the client SHALL dispatch `send_prompt { text: "fix the bug" }` for the session

#### Scenario: Retry button absent on limit-exceeded variant
- **GIVEN** the banner is in `limit-exceeded` variant
- **THEN** no "Retry" button SHALL be rendered in the DOM

#### Scenario: Dismiss clears lastError
- **GIVEN** the banner is in `error` or `limit-exceeded` variant
- **WHEN** the user clicks "Dismiss"
- **THEN** `SessionState.lastError` SHALL be cleared
- **AND** the banner SHALL transition to `hidden` variant

### Requirement: Manual retry hides duplicate user bubble in chat view

When the user clicks the "Retry" action on the `error` variant, the resulting new user message in the session SHALL be flagged with `retriedFrom: <previousUserEntryId>` in `SessionState.messages[]`, and the chat view SHALL skip rendering the bubble for the duplicate.

The flag SHALL be set by the reducer when ALL of the following are true:

- A `message_start` event arrives for a user-role message
- The text content of the new message exactly matches the text of the immediately-preceding user message in `state.messages`
- The turn between those two user messages ended in `lastError` (i.e. the most recent prior assistant message had `stopReason: "error"` OR an `agent_end` set `lastError`)

The session JSONL on pi's side SHALL retain both user entries unchanged. Only the live chat view in the dashboard collapses the duplicate. Resume / fork of the session SHALL see both entries (no persistent-side dedup).

#### Scenario: Retry button send produces flagged message that does not render
- **GIVEN** chat history is [user("fix bug"), assistant(stopReason="error")]
- **AND** the user clicks Retry on the `error` banner
- **WHEN** the resulting `message_start { role: "user", content: "fix bug" }` event arrives
- **THEN** the reducer SHALL flag the new `ChatMessage` with `retriedFrom: <entryId of the first "fix bug" message>`
- **AND** the chat view SHALL render only ONE "fix bug" user bubble
- **AND** the subsequent assistant response from the retry SHALL render normally below it

#### Scenario: Manual identical re-send after successful turn does NOT dedupe
- **GIVEN** chat history is [user("ping"), assistant(stopReason="end_turn")]
- **AND** the user types "ping" again and presses Enter
- **WHEN** the resulting `message_start { role: "user", content: "ping" }` event arrives
- **THEN** the reducer SHALL NOT set `retriedFrom` (the preceding turn ended successfully)
- **AND** the chat view SHALL render both "ping" bubbles

#### Scenario: Different text after error does NOT dedupe
- **GIVEN** chat history is [user("fix bug"), assistant(stopReason="error")]
- **AND** the user types "fix the bug" (different text) and sends
- **WHEN** the resulting `message_start { role: "user", content: "fix the bug" }` event arrives
- **THEN** the reducer SHALL NOT set `retriedFrom`
- **AND** the chat view SHALL render both bubbles

#### Scenario: JSONL persistence unchanged by dedup
- **GIVEN** a session whose JSONL on disk contains [user("X"), assistant(error), user("X"), assistant(success)]
- **WHEN** the session is resumed in a new dashboard tab
- **THEN** both user("X") entries SHALL appear in the session's underlying entries
- **AND** the chat view SHALL still apply the dedup rule on render (showing one bubble) when the second user("X") has `retriedFrom` flagged at message_start time

### Requirement: Shared error-pattern module

`USAGE_LIMIT_PATTERN` SHALL live in `packages/shared/src/error-patterns.ts` as a named export. The extension package's `usage-limit-orderer.ts` SHALL re-export the same constant for source compatibility with code that imports it from there. No duplicated regex literal SHALL exist in either the client or the extension.

The pattern source-of-truth SHALL be the version currently in `packages/extension/src/usage-limit-orderer.ts:30`:

```
/usage[_ ]limit[_ ]reached|usage_not_included|insufficient_quota|credit[_ ]balance|quota[_ ]exceeded|resource[_ ]exhausted|monthly[_ ]limit|monthly[_ ]spending[_ ]cap|hourly[_ ]limit|daily[_ ]limit|spending[_ ]cap|exceeded[^"]{0,40}(quota|cap|spending)|reset after \d+[hms]/i
```

#### Scenario: Pattern matches all documented terminal categories
- **WHEN** the pattern is tested against each of: `"usage_limit_reached"`, `"quota_exceeded"`, `"insufficient_quota"`, `"credit balance"`, `"monthly_spending_cap"`, `"resource_exhausted"`, `"reset after 12h"`
- **THEN** each test SHALL return `true`

#### Scenario: Pattern does NOT match generic retryable errors
- **WHEN** the pattern is tested against `"fetch failed"`, `"ECONNRESET"`, `"timeout"`, `"429 Too Many Requests"` (without quota suffix)
- **THEN** each test SHALL return `false`

#### Scenario: Extension re-export resolves to shared module
- **WHEN** code imports `USAGE_LIMIT_PATTERN` from `packages/extension/src/usage-limit-orderer.ts`
- **THEN** the resolved binding SHALL reference the export from `packages/shared/src/error-patterns.ts`
- **AND** the regex `.source` SHALL match the shared module's export `.source`
