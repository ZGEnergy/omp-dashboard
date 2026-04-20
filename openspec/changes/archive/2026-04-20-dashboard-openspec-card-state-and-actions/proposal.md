## Why

Today the session card quietly encodes an OpenSpec change's lifecycle in the *choice* of which action button renders (Apply vs. Verify/Archive), and that choice is driven exclusively by whether every checkbox in `tasks.md` is ticked. Two real pain points fall out of that:

1. **State is invisible.** A user has to reverse-engineer the state machine by looking at which buttons are present. There's no explicit label like `IMPLEMENTING` or `COMPLETE` on the card.

2. **The checkbox tally over-gates archiving.** A `tasks.md` with manual-verification items ("_Manual smoke: open dialog, confirm X_") will stay `in-progress` forever unless the human ticks those boxes *in an editor* — the dashboard offers no way to do it from the card. Verified real case: session `019da559-…` attached to `improve-path-picker`, 30/33 ticked, all artifacts `done`, CLI `isComplete: true` — yet the card shows **Apply** instead of **Verify/Archive** because three manual-smoke boxes are unchecked.

A third, smaller ask piles on: the **Bulk Archive** button eats precious card space on attached sessions where it's basically never the next action the user wants.

This change addresses all three: expose state explicitly, give users a way to tick tasks from the card, add an escape-hatch archive for users who accept "artifacts authored" as sufficient, and move Bulk Archive to unattached-only.

## What Changes

- **Show `ChangeState` on the card.** Render a small, color-coded state pill (`PLANNING` / `READY` / `IMPLEMENTING` / `COMPLETE`) next to the attached-change name so users don't have to infer state from button choice.
- **Task checkbox toggling from the card.** Add a lightweight task-list popover (opened from a new `Tasks (N/M)` button) that lists each `- [ ]` / `- [x]` item from the attached change's `tasks.md` and lets the user toggle any box. Toggling writes through a new server endpoint that edits `tasks.md` in place, then triggers an openspec refresh.
- **"Archive anyway" escape hatch.** When the CLI reports `isComplete: true` (artifacts authored) but the task tally isn't 100% (state = IMPLEMENTING), expose an **Archive anyway** action in an overflow menu on the attached-session action row. Gated on `isComplete === true && allArtifactsDone`. The default Apply button stays put.
- **Bulk Archive moves to unattached-only.** Remove the Bulk Archive button from the attached-session action row; keep it alongside the attach combo on unattached sessions where it already exists.

**BREAKING**: none at the protocol level. One new REST endpoint pair is added (`GET /api/openspec/tasks`, `POST /api/openspec/tasks/toggle`); existing fields are untouched.

## Capabilities

### New Capabilities

- `openspec-task-toggle`: server-side reading and toggling of individual checkboxes in an OpenSpec change's `tasks.md`, plus the client UI that surfaces the list on the session card.

### Modified Capabilities

- `openspec-attach-combo`:
  - ADD a requirement that the session card renders a visible `ChangeState` pill next to the attached badge.
  - MODIFY the "Bulk Archive button on session card when completed changes exist" requirement so the button is shown **only** on unattached sessions (current spec explicitly keeps it on both; that line is reversed).
  - MODIFY the "LLM action buttons for IMPLEMENTING state" requirement so it also describes the **Archive anyway** overflow action when `isComplete && allArtifactsDone`.

## Impact

- **Shared types** (`packages/shared/src/types.ts`): `OpenSpecChange` gains optional `isComplete?: boolean`. `deriveChangeState` stays as-is — we're adding orthogonal UI, not rewriting the state machine.
- **Shared poller** (`packages/shared/src/openspec-poller.ts`): `buildOpenSpecData` forwards `isComplete` from `openspec status --change <name> --json` (field pass-through; no extra CLI calls).
- **Server**: new `openspec-tasks.ts` module + route wiring for `GET /api/openspec/tasks?cwd&change` and `POST /api/openspec/tasks/toggle`; both reuse the localhost guard already in place for the existing openspec routes.
- **Client**: `SessionOpenSpecActions.tsx` grows a state pill, a Tasks popover, and an overflow menu with Archive-anyway; Bulk Archive branch simplifies (unattached only).
- **Docs**: `docs/architecture.md` OpenSpec section + `AGENTS.md` one-liner for the new server module.
- **Back-compat**: older bridge extensions continue to work — `isComplete` is optional, the Archive-anyway affordance simply stays hidden when the flag is absent.
