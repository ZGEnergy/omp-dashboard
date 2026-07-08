# Proposal: Large-context sessions block the main thread and brick the browser

> Scope: this proposal surfaces the problem only. It does not propose a
> solution, a design, or tasks.

## Summary

Opening a session with a large context (many turns) makes the dashboard tab
unresponsive for tens of seconds — the browser effectively bricks. Root cause
is CPU / main-thread render blocking: the transcript renders every message at
once with no virtualization, so render cost scales linearly with message count
and runs synchronously on open.

This is not a memory problem and not an image problem. It reproduces on
text-heavy sessions with few or tiny images.

## Primary problem: no transcript virtualization → main-thread block

### Measured behavior

Three large-context sessions were opened in the running dashboard and sampled
through the full mount (DOM node count, main-thread long-tasks, heap):

| messages | DOM nodes | total blocking | worst block | mount time | heap |
|---:|---:|---:|---:|---:|---:|
| ~1900 | ~23,000 | ~23 s | ~765 ms | ~28 s | 33 MB |
| ~1300 | ~23,000 | ~29 s | ~723 ms | ~33 s | 40 MB |
| ~1800 | ~31,000 | ~38 s | ~730 ms | ~41 s | 48 MB |

- Total blocking time is 23-38 seconds. Over a ~41 s mount the main thread is
  blocked ~93% of the time — the tab is unresponsive and can trip the
  browser's "page unresponsive" prompt.
- DOM node count is ~23,000-31,000 and grows linearly with message count
  ("context too big" == more turns == more nodes).
- Heap stays 33-48 MB, so the cause is CPU / main-thread render work, not
  memory and not image decode (these sessions had 0-11 images).
- The worst single synchronous block is ~730 ms, on its own far over the
  frame budget.

### Mechanism

- `packages/client/src/components/ChatView.tsx` renders the full message list
  by mapping over all grouped messages. There is no virtualization/windowing.
  Grep of `ChatView.tsx`, `MarkdownContent.tsx`, and `MermaidBlock.tsx` finds
  no `Virtuoso` / `react-window` / `react-virtual`, no `IntersectionObserver`,
  no `content-visibility`, no `loading="lazy"`, no `requestIdleCallback`.
- Every message mounts on open, so per-message render work is multiplied by
  "all messages at once": react-markdown parse per message, Prism syntax
  highlighting per code block, and Mermaid diagram rendering (serialized
  through a single promise chain, one diagram after another).
- The synchronous fold that builds display state is cheap by comparison
  (measured: `JSON.parse` 7-40 ms, reducer 22-118 ms, burst grouping
  0.01-0.28 ms). The cost is DOM construction + per-message renderers, not the
  data pipeline.

### Impact

- Large-context sessions become effectively unusable: the tab freezes for tens
  of seconds on open and may be killed by the browser.
- Severity scales with turn count, so long-running sessions degrade over their
  lifetime.

---

## Secondary measured findings (same root theme)

These are real but smaller than the primary block, and share the "render
everything, defer nothing" root theme.

### Inline full-resolution screenshots (image-heavy sessions)

- Some `browser` tool results inline full-page screenshots as base64 PNG
  `image` parts (individual images ~150 KB base64, ~1899 px wide). One heavy
  session held 56 inline images totaling ~351 MB of decoded RGBA, ~858 ms just
  to decode all of them.
- The client renders these as a full-resolution data URI in an `<img>`
  (`packages/client/src/components/tool-renderers/ToolResultImages.tsx`); CSS
  constrains display size but not the decoded bitmap.
- Each inlined image typically has a sibling text part recording the on-disk
  screenshot path, so the full-resolution bytes are inlined redundantly.
- Not covered by `@blackbelt-technology/pi-image-fit`, which hooks the agent's
  `read` tool (image files), not screenshots inlined into a `browser` result.

### Per-keystroke render cost on heavy sessions

- Live measurement: typing in the composer averaged ~92 ms/keystroke (p90
  ~114 ms) on a heavy session vs ~33 ms (measurement floor) on a light one —
  ~59 ms of extra main-thread work per keystroke when a heavy transcript is
  mounted.
- Mechanism now isolated via a Chrome DevTools trace (see Discovery below).
  It is not burst grouping (measured ~0.1 ms) and `MarkdownContent` is
  `React.memo`-wrapped; the residual cost is synchronous React reconcile +
  forced re-layout of the large mounted DOM on every keystroke.

#### Discovery: keystroke mechanism isolated (Chrome trace)

A Chrome DevTools performance trace of a large-context session (enhanced
trace, ~276k events, source-mapped to the client `react-vendor` chunk
defined at `packages/client/vite.config.ts:90` — confirms this is the
dashboard's own client) isolates the per-keystroke cost. Only distilled
findings below; the raw trace is not committed.

- Every keystroke blocks the main thread far over frame budget. Cost per
  dispatched event: `keypress` ~318 ms, `textInput` ~318 ms, `input`
  ~248 ms, `keydown` ~17 ms. This is ~3x the earlier ~92 ms live
  measurement, consistent with a heavier transcript being mounted.
- Worst single task = **6.79 s**, containing **64 input events processed
  back-to-back with no yielding** (fast typing / paste). Inside that task:
  - React reconcile dominates: `FunctionCall` 5.15 s across 465 calls, all
    in `js @ react-vendor:49` (9.9 s / 896 calls trace-wide).
  - Forced layout: `Layout` / `LocalFrameView::performLayout` **2.23 s
    across 84 synchronous layouts** in the one task — read-after-write /
    re-layout of the large mounted DOM.
  - GC is a symptom not a cause (minor scavenges ~0.15 s).
- Supporting counts: 20,668 `AddedModifiedNodeInAnimationFrame` +
  29,052 `UpdateLayer` — each keystroke mutates a large DOM slice.

This confirms the primary root theme: with the full transcript mounted and
un-windowed, per-keystroke work scales with mounted DOM size because the
synchronous React render + browser re-layout traverse the whole tree.
Mechanism was previously flagged as unconfirmed; it is now measured.

---

## Verification notes

- JS-pipeline timings measured by running `event-reducer` and
  `group-tool-bursts` outside the browser over real sessions.
- DOM/blocking/heap numbers measured by driving the running dashboard in a
  headless browser and sampling through mount.
- Scroll-time jank was not reproduced in the headless harness (transcript did
  not fully settle within the scroll window); it is not asserted as measured.

## Out of scope

- No solution, mitigation, virtualization strategy, or rendering/state change
  is proposed here.
- No design, requirements, spec deltas, or tasks.
