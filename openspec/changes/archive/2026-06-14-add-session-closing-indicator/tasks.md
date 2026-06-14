# Tasks

## 1. Add the transient flag

- [x] 1.1 In `packages/shared/src/types.ts`, add `closing?: boolean` to
      `DashboardSession`, next to `resuming?`. Document it as a client-side
      transient (bridges/server SHALL NOT send it), mirroring `resuming`.

## 2. Optimistic set + safety revert

- [x] 2.1 In `packages/client/src/hooks/useSessionActions.ts`,
      `handleShutdownSession` sets `closing = true` on the target session via
      `setSessions` (mirror the `handleResumeSession` optimistic pattern) before
      / together with `send({ type: "shutdown", sessionId })`.
- [x] 2.2 Start a bounded safety-revert timer (default 10s): if the session is
      still present when it fires, clear `closing` so the card stops spinning
      and re-enables. The normal path never hits this — `session_removed`
      removes the card first.

## 3. Closing visual on the card

- [x] 3.1 In `packages/client/src/components/SessionCard.tsx`, when
      `session.closing` is true: dim the card, replace the ✕ icon
      (`session-close-btn`) with a spinner, and disable the close control so
      re-clicks are no-ops.
- [x] 3.2 Keep the card otherwise readable (name/status still legible) so the
      user can confirm which session is closing.

## 4. Verify

- [x] 4.1 Click ✕ on an idle session: card immediately dims + shows spinner;
      the ✕ no longer fires on re-click; card disappears when `session_removed`
      lands.
- [x] 4.2 Click ✕ on a streaming session: existing confirm() still gates;
      on confirm, the closing state appears.
- [x] 4.3 Simulate a missing `session_removed` (no broadcast): after ~10s the
      card reverts from closing to normal and the ✕ works again.
- [x] 4.4 Resume, abort, and other actions are visually unchanged.
