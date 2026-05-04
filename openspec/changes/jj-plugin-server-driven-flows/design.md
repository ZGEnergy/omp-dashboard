## Context

The jj plugin shipped in `add-jj-workspace-plugin` with three deliberate constraints that have proven friction-heavy in actual use:

1. **Decision 5**: Fold-back is a skill, not a button. The `JjFoldBackDialog` builds a prompt and copies it to the clipboard; the agent must paste and run it. No progress feedback, no typed errors, no certainty the operation actually happened.
2. **Workspace-add spawns a fresh session.** The original session keeps its old cwd in the repo root. Conversation history splits across two sessions for what is conceptually one piece of work.
3. **Dialogs live in per-component React state.** No way for the server to push progress, errors, or multi-phase status into a dialog the user is already looking at.

Constraint 1 was rationalized by skill ownership of refusal preconditions (conflicts, dirty index, empty WC, non-colocated). Constraint 2 was a deliberate parallelism choice. Constraint 3 was simply "we hadn't built anything else yet."

The dashboard has matured since:

- `PromptBus` + `dashboard-default-adapter` already handle server-driven dialogs for chat prompts (`src/extension/prompt-bus.ts`, `src/extension/dashboard-default-adapter.ts`).
- `prompt-component-registry` is the typed substrate for registering new prompt-types client-side (`src/client/lib/prompt-component-registry.ts`).
- The browser WS gateway (`src/server/browser-gateway.ts`) already supports plugin-namespaced events forwarded per-session.
- The SIGTERM-and-respawn-with-same-JSONL primitive is **already shipped** by the `headless-reload-via-respawn` change. `handleHeadlessReload` in `packages/server/src/browser-handlers/session-action-handler.ts` calls `headlessPidRegistry.killBySessionId(sessionId)` then `spawnPiSession(cwd, { sessionFile, mode: "continue", strategy: "headless" })`. The `memorySessionManager.register` hook preserves accumulated state (tokens, cost, context, attachedProposal) on re-hydration. Same primitive reused by `handleSendPrompt` for auto-resume of ended sessions. **This change consumes the existing primitive with a different `cwd` argument; no new pi or process-manager API is needed.**

This change consolidates the jj plugin onto these substrates.

## Goals / Non-Goals

**Goals:**

- Make `+ Workspace` a one-click operation: dialog → continuous-conversation respawn in workspace cwd.
- Make `Fold back` a one-click operation: dialog → server executes → progress streamed → done or actionable error.
- Centralize plugin dialogs on PromptBus so server-pushed progress events render in the same dialog the user is already looking at.
- Pure-TS port of the bash skill's preflight + rollback so it is unit-testable and produces structured error codes.
- Keep skills as documentation pointers for headless agents; do not delete the skill files.

**Non-Goals:**

- New jj features (no new commands beyond what the existing skill already runs).
- Generalizing PromptBus into a "plugin dialog framework" (other plugins do their own thing for now; this change doesn't propose a slot taxonomy expansion).
- Changing the activation gate (jj binary + `.jj/` directory) — unchanged from current spec.
- Changing the workspace path convention (`<workspaceRoot>/<name>`, default `.shadow/<name>`) — unchanged.
- Adding squash or PR modes server-side (Phase-2 follow-up; initial endpoint exposes preserve-only).

## Decisions

### Decision 1: Reverse Decision 5 — fold-back becomes a server endpoint

**Choice:** Implement fold-back as `POST /api/jj/workspace/fold-back` with progress streamed over the existing browser WS gateway. Rewrite the bash logic in TypeScript with structured error codes.

**Alternatives considered:**

- Keep skill-only — rejected because the failure mode ("did anything happen?") is the user's primary complaint.
- Server shells out to the existing bash script — rejected because we'd have to parse stdout for progress and lose typed errors. The bash is ~40 lines; rewriting in TS is cheap.
- SSE endpoint — rejected because the dashboard already has a browser WS gateway; adding a second transport for one feature is wasteful.

**Why:** Typed errors surface in the dialog as actionable copy ("git index is dirty: run `git reset` or `jj new -m WIP`"). Progress events let the dialog show phase transitions (preflight → bookmark → rebase → push → done) instead of an opaque spinner. The skill remains as documentation for headless agents, rewritten as a one-paragraph pointer to the endpoint.

### Decision 2: Workspace-add respawns the current session (headless-only)

**Choice:** `POST /api/jj/workspace/add` (modifying the existing handler in `packages/server/src/routes/jj-routes.ts`) requires a `sessionId` in the request body. After creating the workspace directory, the server reuses the proven `headless-reload-via-respawn` pattern verbatim:

```ts
// 1. Headless precondition (killBySessionId only operates on headless PIDs)
if (headlessPidRegistry.getPid(sessionId) === undefined) {
  return refuseSessionNotHeadless();
}

// 2. Busy-check (matches handleHeadlessReload guard)
if (session.status === "streaming") return refuseSessionBusy();

// 3. Idempotent SIGTERM by sessionId
headlessPidRegistry.killBySessionId(sessionId);

// 4. Respawn with same JSONL but new cwd. Strategy hardcoded to "headless":
//    the kill primitive only handles headless PIDs, so respawning with any
//    other strategy after a successful kill would orphan the spawn semantics.
await spawnPiSession(workspacePath, {
  sessionFile: session.sessionFile,
  mode: "continue",
  strategy: "headless",
});
```

The `memorySessionManager.register` re-hydration carries tokens/cost/context/attachedProposal automatically (same guarantee that headless-reload depends on). The Phase-5 `pendingAttachRegistry.enqueue` call is dropped from this path — it was needed for the *new-session* spawn flow to apply auto-rename when a fresh `session_register` arrived; on respawn the same `sessionId` re-registers and the existing `attachedProposal` is already preserved via `memorySessionManager.register`.

**Alternatives considered:**

- Spawn new session (current Phase-5 spec) — rejected per user feedback. Splitting history across two sessions defeats the "one openspec change = one continuous conversation" model.
- Both modes exposed via a toggle — rejected; YAGNI for now. Add later if anyone actually wants parallel agents.
- Switch cwd in-place via `process.chdir()` — rejected; cwd is captured by the pi child at spawn and read by dozens of downstream consumers (git polling, openspec polling, file paths in chat history). Mid-process change creates silent inconsistency.

**Why:** Continuous conversation is the right default for the openspec workflow. The respawn primitive is **already shipped and exercised in production** by headless reload and ended-session auto-resume; this change just calls it with a different `cwd`.

### Decision 3: Client-local React dialogs + server-pushed WS progress events

**Choice:** `JjActionBar` button handlers open client-local React dialogs (`JjWorkspaceCreateDialog`, `JjFoldBackProgressDialog`, `JjForgetConfirmDialog`) via typed local state. The progress dialog subscribes to the plugin-namespaced WS event channel (`jj:fold-back-progress`, filtered by `jobId`) via the existing `usePluginContext()` hooks (`packages/dashboard-plugin-runtime/src/plugin-context.tsx`) and renders phase-by-phase status as events arrive.

**Why not PromptBus:** PromptBus (`packages/extension/src/prompt-bus.ts`) routes **bridge-originated** `ask_user` prompts (extension → adapter → server → browser via `prompt_request` WS messages). It has no path for **client-originated** dialogs (button click) and no path for **server-originated** push (the server is not a PromptBus adapter; the bus lives in the bridge process). Wiring server-pushed progress through PromptBus would require spoofing bridge messages from the server — a substantial new surface for no functional gain over a plain WS event channel.

**Alternatives considered:**

- Route everything through PromptBus — rejected; doesn't fit (see above).
- New `dialog` slot in plugin runtime taxonomy — rejected as scope creep; multi-plugin concern, separate change.
- Keep clipboard-skill flow + add WS events only — rejected; the dialog UX is the headline fix.

**Why local dialogs:** The client already owns dialog state for every other plugin interaction; nothing about jj's flows requires server-driven dialog mounting. The server's job is to publish progress; the client's job is to render.

### Decision 4: Fold-back error codes are stable strings

**Choice:** The endpoint returns `{ ok: false, code, message, data? }` with a closed enum of codes:

| Code | When |
|---|---|
| `NOT_COLOCATED` | Repo lacks `.git/` next to `.jj/` |
| `EMPTY_WORKING_COPY` | `@` has no diff vs parent |
| `CONFLICTS_PRESENT` | `jj resolve --list` non-empty before fold-back starts |
| `DIRTY_INDEX` | `git diff --cached --quiet` exits non-zero |
| `BOOKMARK_EXISTS` | A bookmark named after the workspace already exists locally |
| `REBASE_CONFLICT` | Rebase produced conflicts; `data.files: string[]` lists them; server has already restored pre-rebase op |
| `PUSH_FAILED` | `jj git push` non-zero exit; `data.stderr` carries the message |

**Alternatives considered:**

- HTTP-status-only (no codes) — rejected; client UX needs branch-by-condition.
- Free-form error strings — rejected; strings drift, codes don't.

### Decision 5: Progress events use plugin-namespaced WS message types

**Choice:** Fold-back progress events are sent as `{ type: "jj:fold-back-progress", jobId, phase, status, data? }` over the existing browser WS gateway. The plugin's client subscribes to its own namespace via the existing `PluginContextProvider` hooks (`packages/dashboard-plugin-runtime/src/plugin-context.tsx`) and `JjFoldBackProgressDialog` filters by `jobId` so two concurrent fold-back operations in the same browser don't cross-render.

**Alternatives considered:**

- New event taxonomy in shared types — rejected; the WS gateway already accepts free-form payloads from plugins, no shared-type expansion needed.
- One blocking POST that returns the final result — rejected; user explicitly wants per-phase progress. Even a 3-second op benefits from "preflight ✓ rebase ✓ push…" feedback.

### Decision 6: Skill files become pointers

**Choice:** `.pi/skills/jj-workspace-fold-back/SKILL.md` is rewritten to a one-paragraph instruction telling agents to call `POST /api/jj/workspace/fold-back` with the workspace name. The full bash flow is preserved in a `legacy-bash/` subfolder for reference but not in the SKILL.md body.

`.pi/skills/jj-workspace/SKILL.md` is updated to reference the endpoint in its "Shipping work back to trunk" section but otherwise unchanged.

**Alternatives considered:**

- Delete skill — rejected; headless / non-dashboard agents need a documented path.
- Keep both flows (skill bash + endpoint) as first-class — rejected; two sources of truth drift.

### Decision 7: `JjFoldBackDialog` and `JjForgetConfirmDialog` rewritten, `buildFoldBackPrompt` deleted

**Choice:** After the new server endpoint and WS contract are in place, both standalone dialog components are rewritten against the new server-driven model (POST + subscribe to progress events) and `buildFoldBackPrompt` (the clipboard helper) is deleted entirely. Tests are rewritten against the new components.

**Alternatives considered:**

- Keep old components, add WS hook to existing `JjFoldBackDialog` — rejected; old component's state shape (build prompt string → copy to clipboard) is incompatible with progress-driven render.
- Move dialogs into a shared plugin-runtime dialog primitive — rejected as scope creep.

## Risks / Trade-offs

- **[Risk]** Server-side fold-back loses the bash skill's `jj op log` rollback if the TS rewrite has a bug. → **Mitigation**: TS port preserves the same `jj op log` capture-and-restore pattern; covered by unit test (`Rebase produces conflict → server restores pre-rebase op`).
- **[Risk]** Respawn-on-workspace-add interrupts active tool calls in the source session. → **Mitigation**: `POST /api/jj/workspace/add` checks `session.status` first and rejects with `SESSION_BUSY` if a tool call is in flight, asking the user to wait. Equivalent to the existing abort-before-shutdown pattern.
- **[Risk]** Workspace-add requires the source session to be headless (`killBySessionId` only operates on headless PIDs). Sessions running under tmux/wt/wsl-tmux strategies cannot be respawned this way. → **Mitigation**: refuse with typed error `SESSION_NOT_HEADLESS` and surface actionable copy in the dialog ("Switch to headless mode and retry, or run `jj workspace add` manually"). Lifting this limitation requires a generic kill primitive across spawn mechanisms — out of scope.
- **[Risk]** Plugin-namespaced WS event types may collide with future protocol additions. → **Mitigation**: Namespace prefix (`jj:`) on every plugin event; documented as the convention for plugin → browser pushes.
- **[Risk]** Headless agents that learned the old skill flow break. → **Mitigation**: Skill file rewritten as pointer; old bash preserved in `legacy-bash/` subfolder for one release cycle.
- **[Trade-off]** Browser must be open to see fold-back progress; if the user closes the tab mid-fold-back the operation completes but the user only sees the final state on next reconnect. **Acceptable** — operation is async by design.
- **[Trade-off]** Removing standalone dialog components means tests must be rewritten. **Acceptable** — the new prompt-bus flow has clearer seams (component receives typed prompt, emits typed result) and tests are easier.

## Migration Plan

The plugin must keep working at every commit. Order:

1. **Server endpoints first, no client wiring.** Add `/api/jj/workspace/{add,forget,fold-back,list}` and `/api/jj/init-colocated` routes. Existing clipboard-skill flow continues to work (clients haven't changed).
2. **Prompt-types registered, dialogs available but unused.** Register `jj-workspace-create`, `jj-fold-back`, `jj-fold-back-progress`, `jj-forget-confirm` in the prompt-component-registry. Old `JjFoldBackDialog`/`JjForgetConfirmDialog` still mounted by `JjActionBar`.
3. **Rewire `JjActionBar` to PromptBus.** Replace `window.prompt` and local dialog state with `promptBus.emit(...)`. At this commit both old dialogs and new prompt-types exist; old ones are no longer reachable.
4. **Delete dead code.** Remove `JjFoldBackDialog.tsx`, `JjForgetConfirmDialog.tsx`, `buildFoldBackPrompt`, related tests. Rewrite tests against the new prompt-types.
5. **Rewrite skill files.** Update `.pi/skills/jj-workspace-fold-back/SKILL.md` and `.pi/skills/jj-workspace/SKILL.md`. Move legacy bash to `legacy-bash/` subfolder.

**Rollback:** Each step is independently revertable. Steps 1–2 are pure additions. Step 3 is one-file rewire. Step 4 is git-revertable. Step 5 is doc-only.

## Open Questions

- **Should `+ Workspace` allow choosing the target session for respawn**, or always respawn the source session (the one whose card holds the action bar)? **Default**: always respawn the source session; no UI for choosing another. Revisit if multi-session use cases emerge.
- **Should fold-back progress events be persisted in the session JSONL** so they survive a client reconnect? **Default**: no — progress events are ephemeral; final success/failure is fetched on reconnect via a `GET /api/jj/jobs/:id` lookup. Initial endpoint omits the GET and relies on the client being connected; if reconnect-mid-flight becomes a real complaint, add the lookup.
- **Should the squash and pr modes from the existing skill be exposed by the endpoint**? **Default**: not in this change. Initial endpoint accepts `mode: "preserve"` only (the default); squash/pr added in a follow-up change once the substrate is proven.
