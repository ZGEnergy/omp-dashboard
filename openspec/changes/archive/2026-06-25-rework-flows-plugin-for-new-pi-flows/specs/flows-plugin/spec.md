## ADDED Requirements

### Requirement: FLOWS subcard availability is gated on extension presence, not flow count

The flows-plugin's `shouldRenderFlowsSubcard` predicate (manifest `session-card-flows` claim) SHALL report the FLOWS subcard as available when the pi-flows extension is active in the session's cwd — detected by a flows-namespaced command in the session's `commandsList` (pi-flows registers `/flows` plus `flows:*` in every session it loads into) — OR when the session has any flow event (live or replayed). It SHALL NOT gate on `flowsList` length, so a cwd where pi-flows is active but no flows are authored yet still shows the subcard (the author-first-flow / edit-mode case). The removed `flows:new` command SHALL NOT be used as a signal.

The availability cache SHALL remain closed-by-default (returns `false` until the first `commandsList` publish for the session) to avoid cold-boot flicker, and SHALL recompute on `commandsList` / `flowsList` publishes via the existing module-level subscriber.

#### Scenario: Active-but-empty flows cwd shows the subcard
- **WHEN** a session's `commandsList` contains a command named `flows` (pi-flows active) and its `flowsList` is empty
- **THEN** `shouldRenderFlowsSubcard(session)` SHALL return `true`

#### Scenario: Any flows-namespaced command counts as presence
- **WHEN** a session's `commandsList` contains a command whose name starts with `flows:` (e.g. `flows:delete`)
- **THEN** `shouldRenderFlowsSubcard(session)` SHALL return `true`

#### Scenario: No flows command hides the subcard even if flows are listed
- **WHEN** a session has a non-empty `flowsList` but no `flows` / `flows:*` command in `commandsList`
- **THEN** `shouldRenderFlowsSubcard(session)` SHALL return `false`

#### Scenario: A run keeps the subcard visible
- **WHEN** a session has any `flow_*` event (live or replayed) regardless of its current `commandsList`
- **THEN** `shouldRenderFlowsSubcard(session)` SHALL return `true`

#### Scenario: Closed by default before first publish
- **WHEN** no `commandsList` has been published for a session and it has no flow events
- **THEN** `shouldRenderFlowsSubcard(session)` SHALL return `false`

#### Scenario: `flows:new` is not a signal
- **WHEN** availability is computed for a session
- **THEN** the presence of (or absence of) a `flows:new` command SHALL NOT affect the result (the command was removed upstream)
