## Context

The bridge extension (`packages/extension/src/bridge.ts`) is loaded inside every dashboard-spawned pi session. On `session_start` it wires PromptBus over `ctx.ui.confirm/select/input/editor/multiselect/notify`, turning the dashboard into the de-facto UI surface for the session. However, the `ctx.hasUI` boolean — pi's authoritative "is there a UI" signal that extensions branch on — is left untouched. For dashboard-spawned `pi --mode rpc` sessions, pi initializes `ctx.hasUI = false`, so extensions still believe they are running headless.

Three installed extensions read `ctx.hasUI`:

1. **context-mode** (`/ctx-stats`, `/ctx-doctor`): `if (hasUI) ctx.ui.notify(text); else return {text}`. The `{text}` return value has no rendering path in pi RPC headless mode — the output is silently dropped. Only the bridge's optimistic `command_feedback {completed}` pill reaches the dashboard.
2. **pi-agent-browser**: `if (!ctx.hasUI) return false` (skips the install-confirm dialog entirely on missing binary).
3. **pi-web-access**: `resolveWorkflow(..., ctx?.hasUI !== false)` — `hasUI` truthy ⇒ `"summary-review"` (opens curator); falsy ⇒ `"none"`.

The dashboard already provides everything `hasUI === true` implies for extensions that route through `ctx.ui.*`. The mismatch between "we have proxied UI methods" and "`ctx.hasUI === false`" is the bug.

## Goals / Non-Goals

**Goals:**
- Make `/ctx-stats` and `/ctx-doctor` render their output in dashboard-spawned RPC sessions (the reported bug).
- Generalize: any extension that uses the `if (ctx.hasUI) ctx.ui.notify(...)` pattern works in dashboard sessions.
- Keep `detectSessionSource` semantics unchanged — `cachedHasUI` must hold the original (pi-supplied) `ctx.hasUI`, not the bridge-overwritten value.
- Zero regression for tmux/wt sessions (where `ctx.hasUI` is already `true`).
- Zero regression for non-dashboard sessions (bridge isn't loaded).

**Non-Goals:**
- Fixing upstream context-mode (out-of-tree). We could PR a `notify`-unconditional patch, but it would not cover other extensions making the same assumption.
- Introducing a separate `ctx.hasDashboardUI` flag — every extension would need to learn about it; not worth the surface-area expansion.
- Changing `pi-web-access`'s curator-on-`hasUI` default. We accept and document the behavior change.
- Persisting any state about the override; the flip is per-session, per-process, ephemeral.

## Decisions

### Decision 1: Flip `ctx.hasUI = true` on the live `ctx` object

After the bridge has wired its PromptBus wrappers on `ctx.ui.*`, set `ctx.hasUI = true` so extensions that subsequently consult `ctx.hasUI` see the proxied UI.

**Alternatives considered:**
- **A. Introduce `ctx.hasDashboardUI`**: requires every extension to learn the new flag. Rejected — defeats the point of fixing one-line behavior in third-party code.
- **B. Patch context-mode upstream**: narrower fix, but doesn't cover pi-agent-browser or future extensions. Slower (release cycle). Rejected as the primary fix; keep as a parallel upstream nicety.
- **C. Monkey-patch the `ctx` accessor**: needlessly complex. The simple assignment works and is reversible (next `session_start` gets a fresh `ctx`).
- **D. Add a bridge-side filter rewriting handler return values into chat events**: would require parsing every command-handler return shape across all extensions. Brittle and slow. Rejected.

**Why this is the right place:** the bridge already mutates `ctx.ui.*` in the same handler. Flipping a sibling boolean on the same object during the same wiring step is the smallest possible change consistent with the existing pattern.

### Decision 2: Capture `cachedHasUI` BEFORE the flip

`source-detector.detectSessionSource(hasUI, sessionFile)` distinguishes "dashboard-spawned RPC" (`hasUI=false`) from "tmux" (`hasUI=true`). It must continue receiving pi's original value, not the post-flip override. The existing line

```ts
cachedHasUI = ctx.hasUI;
```

already runs early in `session_start` (bridge.ts:1287). The flip MUST happen AFTER this line and AFTER the `ctx.ui.*` patch block (bridge.ts:1448-1521). Any read of `cachedHasUI` thereafter (re-register, source attribution) keeps the pre-flip value.

### Decision 3: Unconditional flip

We always set `ctx.hasUI = true`, even when the original was already `true` (tmux/wt). A no-op assignment is cheaper than a conditional and avoids subtle bugs if pi ever introduces an intermediate value (e.g. `"detached"`). The flip happens only inside `bridge.ts`, so non-dashboard sessions (no bridge) are untouched.

### Decision 4: Honest about the pi-web-access side effect

`pi-web-access` will now default its curator workflow to `"summary-review"` in dashboard RPC sessions. We document the workaround (`workflow: "none"` in pi-web-access config) in the proposal Impact section and in the project FAQ row added by this change. We do NOT special-case pi-web-access in the bridge — that would couple the bridge to a specific extension's internals.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Future extension reads `ctx.hasUI` to gate raw-TTY-only paths (ANSI cursor, `process.stdout.columns`) and breaks under the flip. | Documented in spec; risk is low because dashboard-spawned sessions don't have a real terminal — TTY-poking extensions already misbehave today. If we discover a concrete case we add an opt-out env (e.g. `PI_DASHBOARD_KEEP_HASUI_FALSE=1`). |
| pi-web-access curator opens unexpectedly on every web search in dashboard sessions. | Documented migration note: pin `workflow: "none"` in pi-web-access config. Most dashboard users are already at a browser anyway, so the curator is arguably the better default. |
| pi upstream later changes `ctx.hasUI` from a writable boolean to a getter / frozen field. | Bridge wraps the assignment in a try/catch; on failure logs `[dashboard] failed to flip ctx.hasUI` and continues. Worst-case symptom is restoration of today's behavior — no crash. |
| Tests assert `ctx.hasUI === false` post-session-start for headless-RPC fixtures. | New tests verify the flip happens AND `cachedHasUI` retains the original. Existing `source-detector` tests are not affected (they unit-test the pure predicate). |

## Migration Plan

**Deploy:**
1. Land the bridge patch + tests.
2. `npm run build` → restart server → `npm run reload` to push the new bridge code to active sessions.
3. Verify `/ctx-stats` and `/ctx-doctor` render in a dashboard-spawned RPC session.

**Rollback:**
- Revert the single bridge.ts assignment line and corresponding tests.
- Restart server + `npm run reload`. No persisted state, no data migration.

**User-visible migration note (for release notes / FAQ):**
> Dashboard-spawned RPC sessions now report `ctx.hasUI = true` to extensions, matching the dashboard's role as the UI surface. If you use `pi-web-access` and prefer not to open the curator window on web searches, add `"workflow": "none"` to its config.

## Open Questions

None — survey complete. Three installed `hasUI` consumers identified; behavior under the flip is well-understood for each.
