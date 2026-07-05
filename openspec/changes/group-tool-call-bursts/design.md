## Context

The chat renders the reducer's `ChatMessage[]`. `ChatView.tsx` currently runs `groupConsecutiveToolCalls()` (semantic axis: identical tool + identical args, ≥3, non-running → `×N`). Heterogeneous investigation bursts do not match and render flat. This change adds a temporal axis and settles four design forks that were resolved live against a served mockup.

## Grouping axes (two, composed — not one replacing the other)

```
SEMANTIC (existing)                 TEMPORAL (new)
same tool + same args               any tools, one uninterrupted run
collapse when done (×N)             collapse while running AND when done
never groups running                groups running; auto-expanded live
```

**Composition — burst OUTER, semantic INNER (revised per review, findings 1/2/6).** The burst pass runs FIRST, directly over the raw reducer `ChatMessage[]`, and determines burst spans with its OWN boundary rules. `groupConsecutiveToolCalls` is then applied to the member sub-array of each formed burst, so `×N` groups nest *inside* a burst. `group-tool-calls.ts` stays byte-for-byte untouched — it is just now called on a slice.

Why the flip: the semantic pass treats `assistant` as transparent **unconditionally** (`TRANSPARENT_ROLES` in `group-tool-calls.ts:15` has no emptiness check). If the semantic pass ran first, a prose row between two identical calls (`[curl, curl, "found it", curl, curl]`) would be absorbed into a `×4` group and the prose would never reach the burst pass as a boundary — over-merge (contract #6). Running burst-first with a prose-aware boundary fixes this.

### Burst formation (own boundary logic — NOT a reuse of the semantic transparent set)
- A burst is a maximal run of consecutive **`toolResult` rows**, walking across TRANSPARENT rows: `thinking`, `turnSeparator`, `rawEvent`, `commandFeedback`, and **empty** `assistant` (no text content).
- A **HARD** row terminates the burst: `user`, **non-empty** `assistant` prose, `interactiveUi`, `bashOutput`, `inlineTerminal`, or any other role. (The empty-vs-non-empty `assistant` discrimination is NEW logic this change introduces; it is explicitly not "already skipped" by the semantic pass.)
- Threshold: **≥ 3** `toolResult` members. Sub-threshold runs MUST emit every consumed row verbatim — including intermediate transparents, in original order — mirroring `groupConsecutiveToolCalls`'s `lastToolEnd` verbatim-emit path, so a non-forming run is byte-identical to today (contract #5, finding 7).
- After a burst forms, `groupConsecutiveToolCalls` runs on its `toolResult` members to fold identical sub-runs into nested `×N` lines.

## Resolved decisions (the four forks)

### 1. Honest count, no fabricated total, no progress bar
Mid-turn we do NOT know how many calls the agent will make — there is no plan object. A progress bar needs a denominator we cannot honestly supply. Decision: indeterminate spinner + `"N done"`; drop the bar and any `~M` estimate. When done: `"N tool calls"`.

Rejected: `"12 / ~18"` (implies a plan that doesn't exist), progress bar (needs fake denominator).

### 2. Auto-expand while running → auto-collapse on done
The current rule ("never group running") exists to keep the live tool visible. Rather than reverse that benefit, the burst is **rendered expanded while it contains a running member**, with the live command also surfaced in the header; once the burst boundary is reached and no member is running, it renders **collapsed**.

**State mechanic (specified per finding 4).** A single `useState` cannot express "auto-collapse on done AND honour manual toggle". Use one nullable override cell:
```ts
const [override, setOverride] = useState<boolean | null>(null); // null = follow auto
const isRunning = members.some(m => m.toolStatus === "running");
const expanded = override ?? isRunning;   // derived; auto-collapses when isRunning flips false
const onToggle = () => setOverride(!expanded);
```
No effect needed — `expanded` is derived, so it auto-collapses the render after the running member completes, yet a user toggle (setting `override`) pins the choice for that instance thereafter.

Rejected: collapsed-while-running (loses live visibility, the exact thing the old rule protected).

### 3. Expansion = scrollbox, no inner windowing
Expanded body renders **all** members inside a `max-height` scroll container (≈190px). One collapse level. Matches how `CollapsedToolGroup` already renders every member with no inner cap — least new code, most consistent.

Rejected: middle-elision band ("N more finished" with pinned head+tail) — two nested toggles, re-windowing logic as new calls land mid-run, fights the user's explicit expand intent.

### 4. Coexistence with `×N`
Burst wraps; semantic groups nest. A burst containing a 24× health-poll shows the poll as one `↻ … ×24` line among the individual rows. The nested `×N` uses a distinct muted glyph (`↻`) to separate it visually from real individual rows.

## Header spec

```
running:  ⟳(spin)  Working     [N done]   ……  $ <live command>          (auto-expanded)
done:     ✓         N tool calls           …… 9 greps · 8 reads · 1 git · 12s  (auto-collapsed)
```
**Counting — one definition (resolved per finding 5).** All header counts are over **underlying tool calls**, NOT group members. A nested `×24` contributes 24 to `N done`, to `N tool calls`, and to the breakdown. Only the **formation threshold** counts `toolResult` members (≥3 members), so a burst of `[grepA, ReadB, curl×24]` forms (3 members) and its done header reads `26 tool calls`.
- `N done` = count of completed underlying calls; a still-running member contributes 0 until complete.
- Live-command chip = summary of the single member whose `toolStatus === "running"`. Requires **exporting** `getSummary` from `CollapsedToolGroup.tsx` (currently module-local, covers only `bash/read/edit/write`; finding 8). Extend the map so `grep`/`git`/`glob`/`kb_search` don't fall through to a bare tool name — though note the screenshot greps run *via the `bash` tool* (`$ grep …`), already covered by the `bash` summary.
- Aggregate duration = wall-clock first-member-start → last-member-end when timestamps exist, else sum of member durations; breakdown from a count over `toolName` across underlying calls.

## Preference gating
Reuse `toolCallPrefKey` + `useDisplayPrefs` from `CollapsedToolGroup`: filter members before counting/rendering; a burst with zero visible members renders `null`. The count in the header reflects **visible** members (consistent with `×N` badge counting visible messages).

## Boundaries / risks
- **React keys (finding 3).** `ChatView.tsx:333` keys groups by positional `idx` (`group-${idx}`). That was safe for the *stateless* `CollapsedToolGroup`, but the burst group carries collapse state — under `preserve-chat-head-on-event-trim` (head rows trimmed/prepended) `idx` shifts and React would bleed one burst's expanded/override state into another. FIX: key each burst by its **first member's stable id** (`msg.id`), not `idx`. Tasks enforce this.
- **Membership monotonicity (finding 6).** A running call is emitted standalone while running, then folds into a nested `×N` on completion, so a burst's member identity changes across renders at the `Working → N tool calls` flip. Stable first-member keys (above) absorb the churn; the derived `expanded` (§2) recomputes cleanly. Acceptable trade-off, documented.
- **Scroll-lock shrink (finding 9).** Auto-*expand* growth is covered by `chat-scroll-lock` follow. The auto-*collapse* SHRINK (a ~190px scrollbox → one line when the turn ends) is a NEW transition: a user reading mid-history gets a height drop + content jump. FIX: on the running→done collapse, when the user is NOT pinned to bottom, preserve the scroll anchor (offset of the first visible node) so content does not jump. Covered by a scenario.
- Replay: grouping is pure over the current message array; trimmed heads / reconstructed reasoning change array *contents*, not the grouping contract — seq gaps are irrelevant because grouping keys off role adjacency. (Keying, however, must use member id per the React-keys note above.)
- A trailing running member at the very end of the list keeps the burst expanded indefinitely — correct (turn is still running).
