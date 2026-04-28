# Design — fix-mobile-attach-proposal-display

## Affected files

| File | Change |
|------|--------|
| `packages/client/src/components/SessionHeader.tsx` | Render attached-proposal chip in `MobileHeader` between title and `MobileAttachButton`. |
| `packages/client/src/components/SessionCard.tsx` | Render attached-proposal chip in the `isMobile` early-return branch, below the name/age line. |
| `packages/server/src/browser-handlers/session-meta-handler.ts` | `handleAttachProposal`: extend auto-rename guard. `handleDetachProposal`: revert auto-set name. |
| `packages/server/src/__tests__/session-meta-handler.test.ts` (new or extended) | Cover all four name-state quadrants for attach + detach. |
| `packages/client/src/components/__tests__/SessionHeader.test.tsx` | Cover mobile chip rendering on attached / detached state. |
| `packages/client/src/components/__tests__/SessionCard.test.tsx` | Cover mobile chip rendering on attached state. |

No protocol changes (`browser-protocol.ts`, `protocol.ts` untouched). No persistence/schema changes.

## Server-side: auto-rename rule

Today (`session-meta-handler.ts:37-49`):

```ts
export function handleAttachProposal(msg, ctx) {
  const updates = { attachedProposal: msg.changeName };
  const session = sessionManager.get(msg.sessionId);
  if (session && !session.name?.trim()) {
    updates.name = msg.changeName;
    piGateway.sendToSession(msg.sessionId, { type: "rename_session", ... });
  }
  sessionManager.update(msg.sessionId, updates);
  broadcast({ type: "session_updated", sessionId: msg.sessionId, updates });
}
```

Proposed:

```ts
export function handleAttachProposal(msg, ctx) {
  const session = sessionManager.get(msg.sessionId);
  const updates: Record<string, unknown> = { attachedProposal: msg.changeName };

  // Auto-rename when:
  //   (a) name is empty/whitespace (fresh session — original behavior), OR
  //   (b) name === current attachedProposal (auto-set on a prior attach;
  //       user has not customised, so re-track the new attachment).
  const trimmed = session?.name?.trim();
  const wasAutoSet = !!trimmed && trimmed === session?.attachedProposal;
  if (session && (!trimmed || wasAutoSet)) {
    updates.name = msg.changeName;
    piGateway.sendToSession(msg.sessionId, {
      type: "rename_session",
      sessionId: msg.sessionId,
      name: msg.changeName,
    });
  }

  sessionManager.update(msg.sessionId, updates);
  broadcast({ type: "session_updated", sessionId: msg.sessionId, updates });
}

export function handleDetachProposal(msg, ctx) {
  const session = sessionManager.get(msg.sessionId);
  const trimmed = session?.name?.trim();
  const wasAutoSet =
    !!trimmed && !!session?.attachedProposal && trimmed === session.attachedProposal;

  const updates: Record<string, unknown> = {
    attachedProposal: null,
    openspecPhase: null,
    openspecChange: null,
  };
  if (session && wasAutoSet) {
    updates.name = undefined;
    piGateway.sendToSession(msg.sessionId, {
      type: "rename_session",
      sessionId: msg.sessionId,
      name: "",
    });
  }
  sessionManager.update(msg.sessionId, updates);
  broadcast({ type: "session_updated", sessionId: msg.sessionId, updates });
}
```

### Decision matrix (attach)

| Pre-state `name` | Pre-state `attachedProposal` | Action: attach `bar` | Post-state `name` | Reason |
|------------------|-----------------------------|----------------------|-------------------|--------|
| empty            | null                        | attach bar           | `"bar"`           | (a) original auto-rename |
| `"my custom"`    | null                        | attach bar           | `"my custom"`     | user-named — never override |
| `"foo"`          | `"foo"`                     | attach bar           | `"bar"`           | (b) was auto-set, re-track |
| `"my custom"`    | `"foo"`                     | attach bar           | `"my custom"`     | user customised after auto, never override |

### Decision matrix (detach)

| Pre-state `name` | Pre-state `attachedProposal` | Post-state `name` | Reason |
|------------------|-----------------------------|-------------------|--------|
| `"foo"`          | `"foo"`                     | `undefined`       | revert auto-set |
| `"my custom"`    | `"foo"`                     | `"my custom"`     | user customised — never auto-revert |
| empty            | `"foo"`                     | empty             | nothing to revert |
| `"foo"`          | null                        | `"foo"`           | not auto-set in first place |

### Auto-detect parallel path (`event-wiring.ts:147-156`)

The OpenSpec activity detector emits a `changeName` from tool calls (`openspec status --change foo`, `openspec apply foo`, edits under `openspec/changes/foo/…`). The auto-attach branch in `event-wiring.ts` has the **same one-shot pathology** as the pre-fix `handleAttachProposal`:

```ts
// Today
if (updatedSession?.openspecChange && !updatedSession.attachedProposal && detected.isActive) {
  attachUpdates.attachedProposal = updatedSession.openspecChange;
  if (!updatedSession.name?.trim()) {
    attachUpdates.name = updatedSession.openspecChange;
    piGateway.sendToSession(sessionId, { type: "rename_session", sessionId, name: updatedSession.openspecChange });
  }
  sessionManager.update(sessionId, attachUpdates);
}
```

Proposed (mirrors B's witness):

```ts
const trimmed = updatedSession?.name?.trim();
const nameWasAutoSet = !!trimmed && trimmed === updatedSession?.attachedProposal;
const attachmentWasAutoTracked =
  !updatedSession?.attachedProposal || updatedSession.attachedProposal === updatedSession.name;
const differentChangeDetected = updatedSession?.attachedProposal !== updatedSession?.openspecChange;

if (
  updatedSession?.openspecChange &&
  attachmentWasAutoTracked &&
  differentChangeDetected &&
  detected.isActive
) {
  attachUpdates.attachedProposal = updatedSession.openspecChange;
  if (!trimmed || nameWasAutoSet) {
    attachUpdates.name = updatedSession.openspecChange;
    piGateway.sendToSession(sessionId, {
      type: "rename_session",
      sessionId,
      name: updatedSession.openspecChange,
    });
  }
  sessionManager.update(sessionId, attachUpdates);
}
```

#### Decision matrix (auto-detect attach, detected `changeName="bar"`)

| `name`        | `attachedProposal` | `openspecChange` | Result                                    | Reason                              |
|---------------|--------------------|------------------|-------------------------------------------|-------------------------------------|
| empty         | null               | null             | attach=bar, name="bar"                    | fresh — original behavior           |
| `"foo"`       | `"foo"`            | `"foo"`          | attach=bar, name="bar"                    | auto-tracked, new change detected   |
| `"my custom"` | `"foo"`            | `"foo"`          | only `openspecChange` updates to `"bar"`  | user customised; never override     |
| `"bar"`       | `"bar"`            | `"bar"`          | no-op (converged)                         | `differentChangeDetected` is false  |
| `"my custom"` | null               | null             | attach=bar, name=`"my custom"` (kept)     | inner rename guard fails, outer ok  |

The last row is the most subtle: a user-customised name + no prior attachment is an unusual state, but the rule still does the right thing — attach bar (so the proposal is tracked), preserve the custom name (so the user's intent is respected). A chip will surface the attachment per change A.

### Bridge round-trip

`rename_session` is already a defined `ServerToExtensionMessage` and is acked by `session_name_update`. We're just calling it from one more code path. The bridge's `pi.setSessionName("")` is safe (pi treats empty string as clearing the name) — confirmed by the existing `handleRenameSession` path which uses `msg.name || undefined` and forwards `msg.name` verbatim.

## Client-side: mobile attached chip

### `MobileHeader` (`SessionHeader.tsx`)

Insert a chip between the name span and the `MobileAttachButton`:

```tsx
{session.attachedProposal && (
  <span
    className="text-[10px] text-blue-400 truncate max-w-[40%] flex items-center gap-0.5 flex-shrink-0"
    title={`Attached: ${session.attachedProposal}`}
    data-testid="mobile-header-attached-chip"
  >
    <Icon path={mdiPaperclip} size={0.4} />
    <span className="truncate">{session.attachedProposal}</span>
  </span>
)}
```

`max-w-[40%]` keeps long change names from squeezing out the title; `truncate` does the rest. The existing `MobileAttachButton` continues to handle action affordances (open popover → detach / pick).

### Mobile `SessionCard` branch

Add a one-liner below the existing line-2 (model + activity + context bar + cost), above `OpenSpecActivityBadge`:

```tsx
{session.attachedProposal && (
  <div className="mt-1 flex items-center gap-1 text-[11px] text-blue-400" data-testid="mobile-card-attached-chip">
    <Icon path={mdiPaperclip} size={0.4} />
    <span className="truncate">{session.attachedProposal}</span>
  </div>
)}
```

Distinct from `OpenSpecActivityBadge` (which reads `openspecPhase` / `openspecChange`, not `attachedProposal`). Both can render simultaneously and that is correct — they convey different facts.

## What we considered and rejected

### Persisting an "autoRenamed" boolean on the session

Would let us avoid the `name === attachedProposal` equality check. Rejected: adds a new field to `DashboardSession`, sidecar `.meta.json`, and the bridge protocol; the equality check is sufficient and self-healing (any drift just falls into the "user customised" arm, which is the safe default).

### Auto-renaming on the bridge instead of the server

The bridge already has `setSessionName` plumbing. Rejected: attach/detach is a dashboard-initiated, server-side operation; round-tripping through the bridge to compute auto-rename adds latency and a failure mode where an offline bridge breaks attach UX. Server-side is authoritative.

### Removing auto-rename entirely and relying on the chip

Cleaner conceptually but a behaviour change — long-term users with no chip-rendering desktop habits rely on the auto-rename to find their session in the sidebar. Out of scope for a fix; could be revisited as a separate UX proposal.

### Hiding the existing `MobileAttachButton` when a chip is present

Tempting (less duplication) but the button is the only mobile detach affordance. Keep both: chip = state; button = action.

## Risks

| Risk | Mitigation |
|------|------------|
| User had a custom name that happens to equal a change name | Equality false-positive could clear it on detach. Acceptable: the user can always re-rename, and the case is vanishingly rare (a deliberate name collision). |
| Bridge sends an empty-string rename and pi treats it differently than `undefined` | Confirmed via `handleRenameSession`: pi is given the raw `msg.name`; `pi.setSessionName("")` clears the name. Existing tests cover this. |
| Mobile chip overflows at narrow widths | `max-w-[40%]` + `truncate` + `title` attribute as fallback. |
| Race: client renders chip before `session_updated` arrives | Already correct — `session.attachedProposal` is updated server-side before broadcast, and broadcast happens synchronously after the `update` call in both handlers. |

## Rollback

Revert the four touched files. No data migration. No protocol change. Sessions whose `name` was auto-cleared by a detach simply stay cleared — they fall back to `firstMessage` / cwd basename, which is the original behaviour for unnamed sessions.
