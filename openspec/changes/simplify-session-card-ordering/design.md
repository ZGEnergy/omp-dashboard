## Context

Card ordering today is three competing systems (alive-only order map, recomputed `endedAt` ended tier, `clusterByWorkspaceName` adjacency) plus a latent keying bug for worktree/jj sessions. The goal is one persisted source of truth that drives every tier, with simple move-to-front semantics gated by two user settings.

## The unifying invariant

Store **one flat ordered list per resolved-group-path** holding *all* session ids (alive + ended + hidden). Render by a **stable status-partition**:

```text
flat order[key] = [E1, A1, A2, E2, H1]      E=ended A=active H=hidden
        │ stable partition by status (relative order preserved per tier)
        ▼
active=[A1,A2]   ended=[E1,E2]   hidden=[H1]
        ▼ render
A1 A2  │ ─ Show 2 ended ─ │ E1 E2  │  (H1 under "N hidden")
```

Because partition is **stable** and index 0 is "earliest of every status", `moveToFront(id)` always lands `id` at the **top of its own tier** — active, ended, or hidden — with one operation and no tier-aware logic. Every ordering rule collapses onto `moveToFront` or a no-op:

| Trigger | Gate | Effect |
|---|---|---|
| new session | always | top of active (existing `insert` prepend) |
| resume ended (button/REST/prompt) | always (`front` intent) | top of active (existing) |
| alive turn done (`agent_end`, still idle) | `completedFirst` | top of active |
| alive `ask_user` request | `questionFirst` | top of active |
| `alive→ended` | `completedFirst` | top of ended |
| hide | always | top of hidden |
| unhide | always | clear `hidden` + top of ended |
| drag | always | exact dropped slot |
| bridge reattach | `reattachPlacement` | policy as today |
| **gate OFF** | — | **no-op**: keep slot, partition re-tiers |

"Keep the order" when a setting is off is literally the no-op: the id stays put in the flat list and the status partition moves it into the correct tier.

## Decisions (resolved with the user)

**D1 — `moveToFront` = top-of-tier, not top-of-list-visually.** A single flat list + stable status-partition gives top-of-own-tier for free. An ended id moved to flat index 0 still renders below all active ids (active partition wins the render concatenation) but above all other ended ids. No separate per-tier lists needed.

**D2 — Ended → top of ended tier, gated by `completedFirst`.** Not always-on. When `completedFirst` is off, an ending card keeps its flat-list slot and only changes tier. (Model Z.) The same `completedFirst` toggle governs both the alive-completed→top-of-active move and the ended→top-of-ended move — a session's "completion" surfaces it at the top of whichever tier it lands in.

**D3 — Question signal = `ask_user`.** The "question appeared" trigger fires on the `ask_user` request for an alive session. Gated by `questionFirst`. `moveToFront` is idempotent, so duplicate signals are harmless.

**D4 — Settings are global.** `completedFirst` and `questionFirst` live in `shared/config.ts` beside `reattachPlacement` (per-dashboard, persisted), not per-folder or per-session.

**D5 — "First" = first within the resolved group (per-cwd parent), not the whole sidebar.** Matches the existing per-cwd order map keying.

**D6 — Hidden cards get their own persisted tier.** Hide → top of hidden; unhide → top of ended. Hidden order is real stored state, not a boolean filter applied last.

**D7 — Order map keyed by resolved group path (prerequisite).** The server keys `insert`/`moveToFront`/`remove` by `resolveSessionGroupPath(session)` (pin > `jjState.workspaceRoot` > `gitWorktree.mainPath` > `cwd`) — identical to the client grouping resolver — so worktree/jj sessions share one order list under the parent and every code path agrees on the key. Without this, all the new triggers are no-ops for worktree/jj sessions (they route through `moveToFront(session.cwd)`, a dead key the client never reads).

**D8 — Drop `clusterByWorkspaceName` from the ordering path (reversal).** The user wants no distinguished worktree/jj sub-groups; "first" means first of the whole folder. The flat order + status-partition is the sole order. **This intentionally reverses Decision 15 of `add-jj-workspace-plugin` and its worktree extension.** Grouping-under-parent (collapse) stays; only the cluster-adjacency *ordering* is removed. A future agent MUST NOT "restore" clustering as a bug fix.

## Precedence

When multiple rules could apply to one transition, in order:

1. **Drag-to-resume `keep` intent** — dropped slot wins; no auto-move, no broadcast.
2. **Registry `front` intent** (Resume button / REST / prompt-auto-resume) — move to front.
3. **`reattachPlacement` policy** (bridge auto-reattach, `registerReason: "reattach"`).
4. **New gated auto-move** (`completedFirst` / `questionFirst`).
5. **Status-partition** always re-tiers regardless of the above; tier placement is a render concern, not a stored-order concern.

The existing resume-intent contract is untouched; the new triggers slot in at priority 4 and never override 1–3.

## Migration

Existing persisted maps are alive-only (ended ids were pruned). On first load under the new model:

- For each cwd key, append known ended ids **absent** from the stored list, ordered by `endedAt` desc (the old implicit ordering), so the ended tier looks identical to today on first render.
- One-time, idempotent: ids already present are left in place.

Run during the startup reconcile that previously *stripped* ended ids; invert it to *seed* them.

## Risks / tradeoffs

- **Drag now persists for ended/hidden.** Previously impossible (ended not in the order). Now a drag within the ended tier sticks. Treated as a feature.
- **Reversing clustering** changes worktree/jj visual grouping order. Acceptable per user; flagged loudly so it isn't re-introduced.
- **`ask_user` frequency.** Chatty sessions could move-to-front often. Idempotent + gated, so worst case is a card pinned at top of active while it keeps asking — which is the intent.

## Open items (none blocking)

All design questions from exploration are resolved (D2/D3/D8). No remaining ambiguity; this is ready to implement.
