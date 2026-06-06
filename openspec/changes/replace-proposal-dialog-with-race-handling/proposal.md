# Proposal: replace-proposal-dialog-with-race-handling

## Why

When a session has a proposal manually attached and the LLM emits a new
*active* OpenSpec change (a write under `openspec/changes/<name>/` or an
`openspec` CLI invocation naming a different change), today the server
silently does nothing — the user is never asked whether to follow the
LLM's apparent pivot. The auto-attach path in
`packages/server/src/event-wiring.ts` (the `if (attachmentWasAutoTracked
&& differentChangeDetected)` block, ~line 330) only fires when (a) no
proposal is attached, or (b) the existing attachment was itself
auto-tracked — witnessed now by `isNameAutoSetFromAttachment(session)` in
`proposal-attach-naming.ts` (change: fix-mobile-attach-proposal-display;
the old `name === attachedProposal` equality was refactored into this
helper). For manual attachments, the new changeName is dropped on the
floor (there is no `else` branch).

We want a confirmation dialog that surfaces the conflict — with one
non-trivial twist. The LLM keeps producing tool events while the dialog
is open, so a naive "rewrite the dialog target with whatever changeName
just arrived" approach creates a footgun: the user reads "Replace A with
B?", reaches for the button, the LLM emits an event for E, the dialog
text mutates, the click lands, and the user attaches something they
didn't agree to. Equally bad is the opposite extreme — ignore everything
after the first event — because it pins the user to a stale suggestion
the LLM has already moved past.

This change introduces a server-coalesced, client-rendered "replace
proposal" dialog where the *suggestion target* may update freely as new
events arrive but the *commit target* (what the user's button click
actually attaches) only changes through explicit user action.

## What Changes

- **Add server state** `pendingReplaceProposal: string | null` and a
  per-session `rejectedReplaceProposals: Set<string>` (cleared on
  `agent_end`) to `DashboardSession` and the in-memory session manager.
- **Add an `else` branch** to the OpenSpec activity handler in
  `event-wiring.ts` (alongside the existing `if (attachmentWasAutoTracked
  && differentChangeDetected)`): when `attachedProposal` is set manually
  (i.e. `!isNameAutoSetFromAttachment(session)`), the
  detected `changeName` differs from both `attachedProposal` and
  `pendingReplaceProposal`, the activity is `isActive: true`, and the
  changeName is not in `rejectedReplaceProposals`, the server SHALL set
  `pendingReplaceProposal = changeName` and broadcast
  `session_updated`. Subsequent events with the same `changeName`
  SHALL be no-ops; events with a *different* `changeName` SHALL
  overwrite `pendingReplaceProposal` and re-broadcast (this is the
  coalescing layer).
- **Add browser protocol messages**: `accept_replace_proposal` (commits
  the user's choice — accepts a specific `changeName` and attaches it
  via the existing rename + attach path) and `dismiss_replace_proposal`
  (rejects a specific `changeName`, adds it to
  `rejectedReplaceProposals`, clears `pendingReplaceProposal`).
- **Add a client dialog** rendered when
  `session.pendingReplaceProposal !== null` AND `session.attachedProposal
  !== null`. The dialog tracks its own `committedTarget` state initialised
  from the first `pendingReplaceProposal` it observed. When the server's
  `pendingReplaceProposal` later diverges from `committedTarget`, the
  dialog renders a banner ("⚠ Newer change detected: X. [Use latest]")
  but does NOT mutate `committedTarget` automatically.
- **Clear `pendingReplaceProposal` and `rejectedReplaceProposals`** on
  `agent_end` (mirrors the existing clear of `openspecPhase` /
  `openspecChange` in the `agent_end` handler, ~line 353 of
  `event-wiring.ts`) and on session abort/end.
- **Client dialog depends on `unify-dialog-system`**: the dialog body is
  custom (it carries the `committedTarget` / "Use latest" banner logic,
  so it is NOT a `Confirm` preset), but it MUST be built on the shared
  `Dialog` shell that `unify-dialog-system` introduces — not hand-rolled
  — to avoid creating another one-off dialog that change is built to
  delete. If `unify-dialog-system` has not landed when this is
  implemented, build against its `Dialog` primitive contract or sequence
  this change after it.
- **Edge case — attached proposal no longer exists on disk**: if
  `attachedProposal` points at a change that the OpenSpec poller no
  longer reports (archived/deleted), the server SHALL bypass the
  dialog and auto-attach the new `changeName` directly (no conflict to
  surface — there is nothing to "replace").

## Capabilities

### Modified Capabilities
- `proposal-attachment` — the auto-attach branch is split into three
  cases (no attachment / auto-tracked / manually attached) and gains
  the `pendingReplaceProposal` lifecycle.

### New Capabilities
None. (The dialog UI is part of `proposal-attachment` since it owns
the attach lifecycle; no new capability emerges.)

## Out of Scope

- Multi-target queue: this proposal does NOT queue multiple pending
  suggestions. Newer events overwrite older pending suggestions
  (coalesce, not queue). Accepting one suggestion implicitly accepts
  the most recent server state.
- Cross-session suggestions: `pendingReplaceProposal` is per-session.
  No global "you're working on X but session Y just touched Z" prompts.
- Multi-browser coordination: the existing broadcast pattern means all
  browsers see the same dialog. First-to-act wins; the
  `pendingReplaceProposal` clears on accept/dismiss, broadcast closes
  the dialog on every other client. No per-browser state needed.
