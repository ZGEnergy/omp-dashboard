# Fix mobile attach/detach proposal display: surface attached chip + idempotent auto-rename

## Problem

On mobile, attaching or detaching an OpenSpec proposal to a session has **no perceivable effect** in the session header or session card.

Two compounding causes:

### 1. Mobile surfaces never render the attached-proposal chip

Desktop renders an `📎 <changeName>` chip in two places — the session header (`SessionHeader.tsx:322`) and the session card (`SessionOpenSpecActions` block in `SessionCard.tsx:590`). Both are bound to `session.attachedProposal` and re-render on `session_updated`.

The mobile branches do **not** render either:

- `MobileHeader` (`SessionHeader.tsx:128-188`) shows only `name + paperclip-icon-button + kebab`. The change name is hidden inside the `MobileAttachButton` popover and only surfaces in the button's `aria-label`.
- The mobile early-return branch in `SessionCard.tsx:341-407` shows `OpenSpecActivityBadge` (which reads `session.openspecPhase` / `session.openspecChange` — *event-detected* OpenSpec activity, not user-attached proposal) and then returns before reaching the `SessionOpenSpecActions` block where the desktop attached badge lives.

Result: on mobile the only visible signal that "attach succeeded" is whatever the auto-rename does to `getSessionDisplayName(session)`. Which leads to the second problem.

### 2. Auto-rename is one-shot and one-way

`packages/server/src/browser-handlers/session-meta-handler.ts:37-58` auto-renames a session to the change name **only when the session has no name yet**, and never reverts on detach:

```ts
// handleAttachProposal
if (session && !session.name?.trim()) {
  updates.name = msg.changeName;     // one-shot: only when name is empty
  piGateway.sendToSession(... rename_session ...);
}

// handleDetachProposal
const updates = { attachedProposal: null, openspecPhase: null, openspecChange: null };
// session.name is intentionally not touched
```

State trajectory for the typical mobile user:

```
fresh             attach foo            detach              attach bar
─────             ──────────            ──────              ──────────
name: undef  ──▶  name: "foo"     ──▶   name: "foo"   ──▶   name: "foo"
                  (auto-set)            (no revert)         (skipped: name set)
```

Combined with (1), the user's experience is: "first attach changed the title, every subsequent attach/detach changes nothing".

## Proposed change

Two surgical fixes — additive UI and a tightened auto-rename invariant. No protocol/schema/migration changes.

### A. Mobile UI: render the attached-proposal chip

Add a small `📎 <changeName>` chip — visually consistent with the desktop chip — to the two mobile surfaces:

- **`MobileHeader`**: rendered inline between the title and the paperclip icon button when `session.attachedProposal` is non-empty. The existing `MobileAttachButton` (paperclip + popover) stays as the action affordance; the chip is **read-only** and is placed adjacent to it.
- **Mobile `SessionCard`** (`isMobile` early-return branch): rendered as a single line below the name/age line, when `session.attachedProposal` is non-empty.

Both chips read directly from `session.attachedProposal`. No new props, no new state, no new wire messages — the data is already in the reactive `sessions` Map and arrives via `session_updated`.

### B. Server: idempotent auto-rename keyed on attached proposal

Replace the one-shot `if (!session.name?.trim())` guard with a rule that recognises "the name was set by a previous auto-rename":

- **Attach**: set `name = msg.changeName` when EITHER (a) `session.name` is empty/whitespace, OR (b) `session.name === session.attachedProposal` (i.e. the name was auto-set on a previous attach and the user has not customised it).
- **Detach**: when `session.name === session.attachedProposal` (auto-set, never customised), clear `name` so it falls back to `firstMessage` / `cwd basename` again. When the user has manually renamed, do nothing.

This is local, deterministic, and does not require persisting an "auto-renamed" flag — the `(name === attachedProposal)` equality is the witness.

### C. Server: same witness rule at the auto-detect parallel path

`packages/server/src/event-wiring.ts:147-156` is a second auto-attach site that fires when the OpenSpec activity detector (`shared/openspec-activity-detector.ts`) extracts a `changeName` from a tool call (`openspec status --change foo`, `openspec apply foo`, edits under `openspec/changes/foo/…`). Today it has the **same one-shot pathology** as `handleAttachProposal`: outer guard `!attachedProposal`, inner rename guard `!session.name?.trim()`. Concretely, if a user runs `openspec status --change foo` (auto-attaches foo, auto-names "foo") then later runs `openspec status --change bar`, the detector sets `openspecChange = bar` but skips the auto-attach branch because `attachedProposal` is already "foo" — so `attachedProposal` and `name` stay stale.

Apply the same witness rule to keep this path consistent with B:

- Outer guard becomes `(!attachedProposal || attachedProposal === session.name) && attachedProposal !== detected.changeName` — i.e. "no attachment yet, OR the previous attachment was auto-tracking and a *different* change has been detected."
- Inner rename guard becomes `(!session.name?.trim() || session.name === session.attachedProposal)` — same witness.

This closes the loop so manual attach (B) and auto-detect attach (C) follow the same idempotent-rename contract; otherwise the two code paths drift and the bug resurfaces via whichever path the user didn't fix.

## Why this is safe

- Auto-rename behaviour for **fresh** sessions (no prior name, no prior attachment) is unchanged.
- Manually-renamed sessions are never auto-mutated, in either direction.
- The only behavioural change is: a session whose name was previously auto-set by attach now (i) gets cleared on detach and (ii) follows subsequent attaches. Both match user intuition.
- The mobile chip is purely additive and reads an already-broadcast field; it cannot regress desktop behaviour.

## Out of scope

- Restructuring `OpenSpecActivityBadge` vs. attached-proposal chip semantics (they convey different things — *what pi is doing* vs. *what is bound to this session*).
- Adding the desktop `SessionOpenSpecActions` action bar (Continue / FF / Apply / Verify / Detach) to mobile cards — that's a larger UX call tracked separately.
- Bridge-side rename plumbing — `rename_session` already round-trips through pi via `setSessionName`; we just emit it from one additional code path (B above).
- Detector accuracy itself — wrong-`changeName` extraction (e.g. `openspec archive --help` historical bug, fixed in `fix-openspec-flag-rename-bug`) is an upstream concern in `openspec-activity-detector.ts`. C only ensures that *once* the detector recovers, the session converges; it doesn't prevent an initial mis-fire.
