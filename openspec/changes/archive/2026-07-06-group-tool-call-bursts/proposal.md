## Why

A single investigation turn routinely emits 15–40 heterogeneous tool calls (grep → Read → grep → Read …). Today these render as a flat wall of equal-weight rows: no progress signal while running, no summary when done, and a long scroll to reach the assistant's actual reply. The existing collapse (`groupConsecutiveToolCalls`) only folds **identical** consecutive calls (polling loops → `×24`); it does nothing for a heterogeneous burst, which is the common case. Users want the burst collapsed into one progress-aware group they can expand.

## What Changes

- Add a **second, temporal** grouping axis as the OUTER pass over the existing semantic (`×N`) one: a run of consecutive `toolResult` rows, bounded by non-empty assistant prose / a `user` message / other HARD rows, collapses into one **burst group** (threshold ≥ 3 members). The identical-call collapse then runs INSIDE each burst (burst-outer, semantic-inner) so `groupConsecutiveToolCalls` stays untouched and prose remains a real boundary.
- **BREAKING (behavioral, client-only):** invert the current "running tools are never grouped" rule. While a turn runs, the burst group forms **including** the running tool and is **auto-expanded** so the live tool stays visible; the currently-executing command is surfaced in the group header. When the turn ends (burst boundary reached), the group **auto-collapses** to a one-line summary.
- Header while running: indeterminate spinner + honest `"N done"` count (NO fabricated total, NO progress bar) + the live command. Header when done: check + `"N tool calls"` + tool-kind breakdown + aggregate duration.
- Expanded body is a **fixed-max-height scrollbox** rendering every member row (no inner elision/windowing). One collapse level.
- **Coexistence:** the existing `×N` semantic collapse survives **inside** a burst — a polling sub-run still renders as one `↻ … ×24` line nested among the burst's individual rows. Burst grouping wraps; it does not replace `groupConsecutiveToolCalls`.
- Honour `chat-display-preferences`: burst members gated off by tool-kind prefs are hidden exactly as `CollapsedToolGroup` already does; a burst whose every member is gated off renders nothing.
- No title semantics are fabricated: the collapsed group is titled `"Working"` (running) / `"N tool calls"` (done), never an invented summary of intent.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `chat-view`: add a requirement for temporal **burst grouping** of consecutive heterogeneous `toolResult` rows — formation/boundary rules, the auto-expand-while-running / auto-collapse-on-done lifecycle, the honest running header (count without total), the scrollbox expansion, nested `×N` coexistence, and display-preference gating.

## Impact

- **Code (additions):**
  - `packages/client/src/lib/group-tool-bursts.ts` — pure helper: walk the raw reducer message array with its own boundary rules, emit a mixed list of `ChatMessage | ToolBurstGroup`; inside each burst call `groupConsecutiveToolCalls` on the members so `×N` groups nest. Verbatim-emit on sub-threshold, mirroring the semantic helper.
  - `packages/client/src/components/ToolBurstGroup.tsx` — the collapsed/expanded group component (spinner/check header, `N done` / `N tool calls`, live-command chip, scrollbox body).
  - `packages/client/src/lib/__tests__/group-tool-bursts.test.ts` — formation, boundary (prose/user), threshold, running-inclusion, nested `×N`, prefs-gating.
- **Code (modifications):**
  - `packages/client/src/components/ChatView.tsx` — replace/compose the current `groupConsecutiveToolCalls` `useMemo` with the burst pass; render `<ToolBurstGroup>` for burst items.
- **Interaction (no code change, note only):** operates on the same reducer message array mutated by active changes `preserve-chat-head-on-event-trim`, `reconstruct-reasoning-on-replay`, `fix-history-loading-false-empty-flash`. Grouping is a pure read over that array; seq gaps / trimmed heads are tolerated because grouping keys off role adjacency, not seq.
- **No protocol / server / API changes.** Pure client-side render transform.
- **No persistence.** Collapse state is component-local (`useState`), consistent with `CollapsedToolGroup`.
