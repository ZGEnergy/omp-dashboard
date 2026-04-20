## Context

Current card behavior (packages/client/src/components/SessionOpenSpecActions.tsx):

- `deriveChangeState` in `packages/shared/src/types.ts` maps `OpenSpecChange` → `ChangeState ∈ {PLANNING, READY, IMPLEMENTING, COMPLETE}` using `artifacts[].status === "done"` for PLANNING/rest, then `change.status` (`list --json`'s task-tally) for IMPLEMENTING vs. COMPLETE.
- Action row branches on the enum: `PLANNING → Continue + FF`, `READY|IMPLEMENTING → Apply`, `COMPLETE → Verify + Archive`.
- `Bulk Archive` appears in both branches whenever any folder change has `status === "complete"`.

Reality, verified via CLI:

| Change | `list.status` | ticked | artifacts | CLI `isComplete` |
|---|---|---|---|---|
| `improve-path-picker` | in-progress | 30/33 | all done | **true** |
| `dashboard-ux-fixes-batch` | complete | 22/22 | all done | true |
| `pi-log-miner-skill` | in-progress | **0/75** | all done | **true** |

`isComplete` is *artifact-authoring* complete, not *implementation* complete. `pi-log-miner-skill` is the safety proof: `isComplete: true` alone cannot drive COMPLETE-state button choice.

User session `019da559-…` attached to `improve-path-picker` currently shows Apply; user expects Verify/Archive because the only unticked boxes are three manual-smoke items *they* own and haven't bothered to open an editor for.

## Goals / Non-Goals

**Goals:**
- Make `ChangeState` visible as an explicit pill on the card, same height as the attached badge.
- Let users tick/untick `tasks.md` checkboxes directly from the card, without leaving the dashboard.
- Give users a safe "Archive anyway" escape hatch when artifacts are authored and CLI reports `isComplete`, without changing the default state machine.
- Shrink the attached-session action row by removing Bulk Archive from it.

**Non-Goals:**
- Changing `deriveChangeState`'s branching rules. The enum keeps exactly its current semantics; we're adding orthogonal affordances, not redefining state.
- Supporting multi-select/bulk checkbox toggling. One checkbox at a time keeps the UI and server logic trivial.
- Rendering full task text with markdown inline formatting. Plaintext per line is fine; users can open the full file if they want rich rendering.
- Tracking a checkbox's "edit conflict" semantics. The openspec CLI owns `tasks.md`; if two writers race, last-write-wins is acceptable (this is a single-user tool).

## Decisions

### Decision 1 — Expose `ChangeState` as a pill next to the attached badge, not as a new line

Two layout options:

```
A)  📋 add-auth  [IMPLEMENTING]  [Detach]   ← inline pill, right of badge
B)  📋 add-auth  [Detach]
    State: IMPLEMENTING · 30/33              ← new line below
```

Pick **A**. Cards are height-constrained and state changes rarely; a 10-px pill color-coded by enum (`PLANNING=zinc`, `READY=blue`, `IMPLEMENTING=amber`, `COMPLETE=green`) carries the info without a second row.

**Alternative considered**: replace the attached-badge color with the state color. Rejected because the blue attached-name color is load-bearing (users scan for blue = "there's an attached change here"); re-coloring it would hide both signals.

### Decision 2 — Task-toggle via new REST pair, not via `openspec` CLI write commands

The `openspec` CLI has no "toggle task" verb. Two implementation paths:

- **(a)** Shell out to `sed -i` or similar → fragile, platform-dependent.
- **(b)** Parse `tasks.md` in the server, produce `{id, text, done, line}[]`, and on toggle, rewrite just the one line in place.

Pick **(b)**. `tasks.md` has a rigid line-level format (`- [ ] X.Y description` / `- [x] X.Y description`). A small parser + line-level rewrite is reliable, testable, and cross-platform. We already have atomic JSON write helpers in `json-store.ts` that we can reuse the pattern from for markdown.

Schema:

```ts
interface OpenSpecTask {
  id: string;        // "1.1", "8.3"
  text: string;      // everything after the id, trimmed
  done: boolean;
  line: number;      // 1-indexed, used as optimistic-concurrency token
  group: string;     // "## 1. Shared types"
}

// GET /api/openspec/tasks?cwd=<abs>&change=<name>
//   → { tasks: OpenSpecTask[], groups: string[] }
// POST /api/openspec/tasks/toggle
//   body: { cwd, change, id, done, line }  // line is a sanity check
//   200 → { task: OpenSpecTask }
//   409 → { error: "line mismatch" }  // file changed under us
```

The 409-on-mismatch guards against a pi session rewriting `tasks.md` at the same moment. The client refetches on 409 and re-offers the toggle.

### Decision 3 — Source `isComplete` but use it **only** to gate Archive-anyway, never to drive the enum

Add `isComplete?: boolean` to `OpenSpecChange`, populate from `status --change` JSON, and reference it only in one place in the client:

```tsx
{state === ChangeState.IMPLEMENTING &&
 change.isComplete === true &&
 change.artifacts.every(a => a.status === "done") && (
   <OverflowMenuItem onClick={…}>Archive anyway</OverflowMenuItem>
 )}
```

This keeps `deriveChangeState` pure and unchanged. `pi-log-miner-skill` still shows IMPLEMENTING (correct), and now also gets an Archive-anyway *option* — appropriate because artifacts really are authored; it's a user judgment call whether to archive with no ticked tasks.

**Alternative considered**: surface Archive-anyway unconditionally whenever `allArtifactsDone`. Rejected because it'd show on changes that are genuinely mid-implementation and encourage premature archive.

### Decision 4 — Bulk Archive: unattached-only, no behaviour change otherwise

The attached-session action row removes the `{bulkArchiveButton}` render. The unattached branch keeps it exactly as today. No protocol or server changes.

**Alternative considered**: move Bulk Archive to the folder-level OpenSpec UI (`FolderOpenSpecSection.tsx`), removing it from *both* session branches. Rejected for this change's scope — it duplicates an existing folder-level Bulk Archive and would be a separate UX decision. Keeping the unattached-session affordance preserves muscle memory.

### Decision 5 — Task popover is anchored to a new `Tasks (N/M)` button in the action row

Button label doubles as the progress badge (`Tasks 30/33`). Click opens a popover (reuse `DialogPortal` for positioning consistency with other card dialogs) that lists each task row with a native checkbox. Keyboard: arrow keys navigate, Space toggles, Esc closes.

Ordering in the popover: unchecked items first within each group, then checked. Group headers from `tasks.md` (`## 1. Shared types`) are preserved. This matches what the user scans for: "what's left?".

## Risks / Trade-offs

- **Risk**: parser misreads non-standard `tasks.md` hand-edits (nested lists, indented checkboxes, etc.).
  → **Mitigation**: parser accepts only top-level `- [ ]` / `- [x]` with a leading id-like pattern; anything else is surfaced as a read-only row with `done` unparseable → toggle disabled. Tests cover malformed lines.

- **Risk**: user toggles a box the agent is actively rewriting (race).
  → **Mitigation**: optimistic-concurrency `line` token; 409 triggers refetch. Worst case: a user's tick gets lost and they retry.

- **Risk**: Archive-anyway opens with one careless click on `pi-log-miner-skill` (0 ticked) and archives a non-implemented change.
  → **Mitigation**: it lives in an overflow menu (not a top-level button) and routes through the existing `ConfirmDialog` that already guards regular Archive. The confirm message surfaces `"N of M tasks are unchecked. Archive anyway?"`.

- **Trade-off**: adds one more visual element (state pill) to an already-dense card. Palette is subtle (muted-background pill, enum-color text) so it doesn't fight the attached badge for attention.

## Migration Plan

1. Ship shared-package change: `OpenSpecChange.isComplete?: boolean` + poller pass-through. Safe on its own — no reader uses the field yet.
2. Ship server change: new task routes. Safe additively; no existing endpoints touched.
3. Ship client change: state pill, Tasks popover, Archive-anyway overflow, Bulk-Archive relocation. All four land together because they share `SessionOpenSpecActions.tsx`.

No data migration. Rollback = revert the client commit; server endpoints become unused but harmless.

## Open Questions

- Should the Tasks popover also let users *add* a task? Not in this change. (Tasks are authored in the `/opsx:apply` flow.)
- Should we show archived-change task lists too? Irrelevant — archived changes don't appear attached. If unarchive happens, current behaviour applies automatically.
