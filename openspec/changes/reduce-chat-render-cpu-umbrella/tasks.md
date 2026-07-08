## 1. Phase 4 — input-path memoization (folded in; land first)

- [ ] 1.1 Wrap `ChatView` in `React.memo` (keep the `forwardRef`; `React.memo(forwardRef(...))`). This is a prerequisite for honest Phase 3 measurement — un-memoized renders otherwise mask batching gains.
- [ ] 1.2 Stabilize the 4 unstable props passed at `App.tsx:1545` that would defeat the memo:
  - `onForkFromMessage` inline arrow → `useCallback` (deps: `selectedId`, `handleResumeSession`).
  - `onCloseInlineTerminal` inline arrow → `useCallback` (deps: `selectedId`, `handleCloseInlineTerminal`).
  - `onCollapseStreamingThinking` inline arrow → `useCallback` (deps: `selectedId`, `setSessionStates`).
  - `pendingSteering={… ?? []}` fresh-array literal → hoist a module-level `const EMPTY: string[] = []` (or `useMemo`) so the empty case is referentially stable.
- [ ] 1.3 Confirm the remaining props are already stable: `toolContext`, `handleRespondToUi`, `handleAbort`, `handleForceKill` (audit their definitions; wrap in `useCallback`/`useMemo` if not).
- [ ] 1.4 Verify: per-keystroke main-thread block on a long session drops from ~131 ms toward the input cost alone (React DevTools Profiler: ChatView does NOT re-render on keystroke into the command input). Baseline: keypress 47.7 + textInput 46.6 + input 37.4 ms.

## 2. Phase 1 — stop idle layout churn (animation audit)

- [ ] 2.1 Audit the live long-session page with DevTools Animations panel + a short trace: enumerate every running animation, pin the exact DOM source of the 21 `width`-animating instances and each `background-position-x` / `background-color` / `color` / `box-shadow` offender. Record findings in the change dir.
- [ ] 2.2 Replace the `width` animation(s) with `transform: scaleX()` (transform-origin left) or remove if decorative; verify identical visuals.
- [ ] 2.3 Re-implement `tool-group-sweep` shimmer as a `transform: translateX()` sweep (compositor-only), keeping timing/easing and the reduced-motion strip.
- [ ] 2.4 Convert `background-color`/`color`/`box-shadow` pulses to opacity cross-fades of pre-painted layers (reuse the `chat-stream-glow-pulse` static-shadow pattern).
- [ ] 2.5 Add a shared IntersectionObserver utility that toggles an `fx-offscreen` class (`animation-play-state: paused`) on animated elements outside the viewport; wire it to tool-group shimmer/spin-pulse, streaming glow, and neon card FX (`card-glow-fx`, `card-ring-fx`).
- [ ] 2.6 Ensure completed states unmount/stop their animations (done tool groups, ended streaming bubbles) — verify no `state:running` animations remain for finished elements.
- [ ] 2.7 Unit/visual checks: reduced-motion path unchanged; animations resume on re-entering viewport.
- [ ] 2.8 Verify: record a 30 s idle trace on a long session → < 5 layouts/s and no non-composited page-owned animations (vs. 85/s baseline).

## 3. Phase 3 — coalesce live WS event application

- [ ] 3.1 TDD: unit test proving an N-event burst folded via the queue yields a `SessionState` identical to sequential `reduceEvent` application, in seq order, with `maxSeqMapRef` at batch max.
- [ ] 3.2 Implement per-session event queue + once-per-frame flush (rAF; `document.hidden` fallback to timeout/microtask) in `useMessageHandler`'s live `case "event"` path only (replay untouched).
- [ ] 3.3 Preserve per-event side effects during the fold (interactive requests, plugin event mirror, seq tracking) — covered by tests.
- [ ] 3.4 Verify: simulated 200-events/5s burst produces ≤ 1 render/frame (render-count probe), and live dashboard behavior (streaming text, tool cards, ask_user) is unchanged.

## 4. Phase 2 — bound off-screen transcript cost

- [ ] 4.1 Measure real message-block heights on a long session to derive `contain-intrinsic-size` estimates.
- [ ] 4.2 Step A: apply `content-visibility: auto` + `contain-intrinsic-size` to per-message wrappers (excluding the streaming tail), behind a single toggleable CSS class.
- [ ] 4.3 Re-verify all `chat-scroll-lock` scenarios (auto-scroll follow, scroll-lock when scrolled up, scroll-to-bottom button) plus jump-to-message and `ChatViewHandle` behavior.
- [ ] 4.4 Verify Step A against budget: re-trace → per-pass layout objects bounded by viewport working set; no repeated painting of tall off-screen strips; idle busy < 5 %.
- [ ] 4.5 Decision gate: if Step A misses the budget, scope Step B (true windowing via @tanstack/react-virtual) as a follow-up change with delta specs; do NOT start it inside this change.

## 5. Umbrella verification

- [ ] 5.1 Re-record the full baseline scenario (open long session → idle 30 s → event burst → type 20 chars) and diff against the baseline trace: main-thread busy % (target < 20 % during activity, < 5 % idle), layouts/s idle, renders per burst, EventDispatch p95 (target < 16 ms).
- [ ] 5.2 Run the full test suite (`npm test 2>&1 | tee /tmp/pi-test.log`; grep FAIL) and type-check.
- [ ] 5.3 Manual smoke on a real long session: typing, streaming, scrolling history, tool bursts, reduced-motion mode. (Tested later during ship.)
