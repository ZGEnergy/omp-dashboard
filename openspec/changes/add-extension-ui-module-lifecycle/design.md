## Context

Phase-1 (`add-extension-ui-modal`, archived 2026-04-26) shipped the discovery probe + slash-command-triggered modal. Three lifecycle behaviors were deferred or undefined:

- **Module retraction.** Phase 1 has no per-module remove. Removing one module forces a full re-probe.
- **Command collision across extensions.** Phase 1 covers only the built-in-vs-module case ("Built-in command takes precedence"). Two extensions with the same `command` are unspecified and the implementation does last-write-wins on `id` only, leaving `command` collision behavior nondeterministic.
- **Modal close notification.** Phase 1 dialogs are stateless from the extension's view — there is no way to know the user dismissed.

These holes are not load-bearing for the prototype but they block production use cases (workspace locks, draft state, dynamic module sets driven by external state).

## Goals / Non-Goals

**Goals**

- Per-module retraction without re-emitting the full module list.
- Deterministic resolution of `command` collisions across extensions, with clear diagnostics.
- Opt-in notification when a modal closes, with a reason discriminator that distinguishes user-driven dismissal from session teardown.

**Non-Goals**

- A general module ACL or permission model. Collisions are warnings, not security boundaries.
- Modal-open notifications. The bridge can derive "the user is interacting with this module" from the first `ui_management` it processes; explicit open events would be redundant.
- Cross-session modal coordination. Each session's modal is independent; the protocol does not let extension code in session A see modal events from session B.

## Decisions

### 1. Per-module removal via `{ id, removed: true }` entry in `ui_modules_list`

Reuses the existing message rather than introducing a new one. Server detects the discriminator on the entry; client does the same. The retracted module remains in the message so subscribers receive a clear "delete this id" signal.

**Why not a new `ui_modules_remove` message?** Two reasons:

- The probe is the canonical source of truth. If the probe stops including a module, the server's view of `uiModules` is already wrong without the bridge proactively sending a remove. Embedding removal in the same message is consistent.
- Reduces the message-type surface; the discriminated-union approach has worked well for `ext_ui_decorator { removed: true }`.

### 2. Collision tiebreaker: lexicographic `id`

Deterministic across reconnects. Last-write-wins (the alternative) would change behavior depending on which extension's listener happened to run first in the probe — a hidden coupling on extension load order.

The chosen tiebreaker is documented in the warning so users can tell which module won and which lost.

### 3. Modal-close: reason discriminator instead of a boolean

Three semantically distinct reasons exist:

- `"user"` — explicit dismissal (Esc, click backdrop, close button). Extension may want to confirm draft loss.
- `"navigate-away"` — user switched to a different session while the modal was open. Extension should treat as silent dismissal (no confirm prompt — user already moved on).
- `"session-end"` — session ended (browser disconnect, force-kill, normal exit). Extension should release all locks unconditionally.

A boolean cannot express the distinction. Tested in pi-judo prototype where workspace-lock release semantics differ between user-driven and session-end paths.

### 4. Session-end fan-out: server-driven

The server owns the "which modals are open in which browsers" map (updated by `ui_modal_closed { reason: "user" | "navigate-away" }` from each browser). On `session_end`, it iterates and emits `ui_modal_closed { reason: "session-end" }` for every open `(browser, moduleId)` so the bridge sees one close event per open modal, not one per session.

This is mildly redundant (a session can have at most one open modal per browser, and there are typically 1–3 browsers) but the iteration is cheap and the contract stays uniform.

### 5. Bridge listener isolation for `ui:modal-closed`

The bridge wraps `pi.events.emit("ui:modal-closed", ...)` in try/catch (same pattern as `handleUiManagement`). One bad cleanup handler must not break the close path for other extensions.

## Open Questions

None blocking. Implementation can proceed.

## Out-of-Scope Explicitly

- Modal-open events.
- Pre-close hooks (extension says "no, don't close yet"). Modals are user-driven; the user wins.
- Per-modal command aliases (an extension declaring more than one `command` for the same module). Out of scope; can be added later as a list field.
