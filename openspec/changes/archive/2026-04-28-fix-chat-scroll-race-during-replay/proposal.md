## Why

When a user switches to a session whose events are not cached on the server, `event_replay` arrives in multiple async batches over hundreds of milliseconds. Today the chat view lands the user mid-conversation instead of at the latest message, with the floating scroll-to-bottom button visible — i.e. auto-scroll incorrectly believes the user has scrolled up.

Root cause is a race in `ChatView.tsx`: `scrollTo()` is asynchronous with respect to its `onScroll` event. Between requesting the scroll and the event firing, the next replay batch grows `scrollHeight`. `handleScroll` then measures the *new* `scrollHeight` against the *old* `scrollTop`, sees a large gap, and flips `isNearBottom.current = false` — terminating the chase for the rest of the replay. Cached sessions never trigger this because they finish in a single render.

## What Changes

- Suppress `handleScroll` from mutating `isNearBottom.current` / `showScrollButton` while a programmatic scroll is in flight, mirroring the pattern already used by `scrollToTurn`.
- Set `programmaticScroll.current = true` (with a `setTimeout` clear after ~150 ms) around the two existing programmatic scroll sites:
  - the session-switch effect (`useEffect([sessionId])`, "scroll to end" branch)
  - the auto-scroll-on-new-content effect (`useEffect([state.messages.length, state.streamingText, state.pendingPrompt])`)
- Add an early-return at the top of `handleScroll`: if `programmaticScroll.current` is true, do not touch `isNearBottom.current` or `setShowScrollButton`.
- Leave `scrollToTurn` as-is — it already sets the flag; it just gains the new guard for free.

Out of scope (separate change if observed after this fix):

- Async height growth from markdown rendering, code highlighting, image decoding (would require a `ResizeObserver`-based chase).
- Any server-side "replay complete" signal.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `chat-scroll-lock`: tighten the requirement so user-vs-programmatic scrolls are distinguished. The "near bottom on session switch / on new content" guarantee must hold even when content arrives in multiple async batches after the initial scroll-to-bottom call.

## Impact

- **Code**: `packages/client/src/components/ChatView.tsx` only. No protocol, server, or shared type changes.
- **Tests**: new unit-style coverage that `handleScroll` is a no-op while `programmaticScroll.current === true`.
- **Risk**: very low. The 150 ms suppression window only applies to scrolls we initiate. A real user scroll within 150 ms of an auto-scroll could be missed once, but auto-scroll already overrides such a gesture today, so behavior is unchanged from the user's perspective.
