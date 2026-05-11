## MODIFIED Requirements

### Requirement: Subcards hide when their content is empty
Each subcard's content SHALL be wrapped in the existing prop guards. When a guard yields no element, the corresponding `SessionSubcard` SHALL render nothing (no panel, no title).

| Subcard | Renders only when |
|---|---|
| OPENSPEC | `openspecChanges && onSendPrompt && onAttachProposal && onDetachProposal` AND `SessionOpenSpecActions` produces output (attached proposal OR available changes OR phase) AND **the dashboard `openspec.enabled` config is `true`** AND **the per-cwd `OpenSpecData` indicates the directory is OpenSpec-applicable (`initialized === true` OR `pending === true`)** |
| WORKSPACE | `showGitInfo` is true OR a plugin contributes to `session-card-badge` slot whose `shouldRender` (if declared) returns `true` for the session OR a plugin contributes to `workspace-action-bar` whose `shouldRender` returns `true` |
| PROCESS | `processes && processes.length > 0 && onKillProcess` |
| MEMORY | A plugin contributes to the `session-card-memory` slot whose `shouldRender` (if declared) returns `true` for the session. Claims without a `shouldRender` declaration are treated as always rendering. |
| FLOWS | `flows && onFlowAction` AND there is at least one flow OR a `flows:new` command available |

The new OPENSPEC sub-conditions distinguish *"feature applicable, nothing happening yet"* (still show the attach/init CTA) from *"feature not applicable here"* (hide entirely). The visibility signal is `OpenSpecData.hasOpenspecDir`:

- `openspec.enabled === false` means the user has globally disabled OpenSpec in settings — server broadcasts `hasOpenspecDir: false` for every cwd — hide.
- `OpenSpecData.hasOpenspecDir === false && pending === false` means the server has confirmed there is no `openspec/` directory in the session's `cwd` — hide.
- `OpenSpecData.pending === true` means the server is still polling — show.
- `OpenSpecData.hasOpenspecDir === true && initialized === false` means the project is OpenSpec-initialized (`openspec/` directory exists) but no `openspec/changes/` subdir yet (no proposals authored) — show (init/attach CTA).
- `OpenSpecData.initialized === true` means full poll returned data — show.

The `hasOpenspecDir` field is strictly weaker than `initialized`: `initialized === true` implies `hasOpenspecDir === true`, but `hasOpenspecDir === true` does NOT imply `initialized === true` (the `openspec/changes/` subdir may not exist yet). The session-card visibility gate consults `hasOpenspecDir` (not `initialized`) so freshly-initialized OpenSpec projects without proposals still surface the OPENSPEC subcard.

For MEMORY and WORKSPACE, the wrapper's visibility is now governed by the new `shouldRender` claim field (see `dashboard-plugin-loader` capability). The wrapper SHALL hide when EITHER no plugin claims the slot OR every claim has `shouldRender(session) === false`. A plugin that registers a claim whose component conditionally returns `null` SHALL declare a `shouldRender` so the wrapper does not render an empty panel.

The OPENSPEC subcard SHALL receive enough information to evaluate `OpenSpecData.hasOpenspecDir`, `OpenSpecData.initialized`, and `OpenSpecData.pending`. The exact prop shape is left to implementation; either passing `openspecData?: OpenSpecData` in place of `openspecChanges?: OpenSpecChange[]`, or passing sibling props `openspecHasDir?: boolean`, `openspecInitialized?: boolean`, `openspecPending?: boolean` alongside `openspecChanges` is acceptable. Existing callers without the new signal SHALL behave as if the directory is OpenSpec-applicable (preserve current visibility) until the parent is updated.

#### Scenario: Empty PROCESS subcard is hidden
- **WHEN** a desktop session card is rendered with `processes={[]}`
- **THEN** no element with title text `PROCESS` SHALL appear

#### Scenario: Empty MEMORY subcard is hidden when no plugin claims slot
- **WHEN** a desktop session card is rendered and no plugin has registered a `session-card-memory` claim
- **THEN** no element with title text `MEMORY` SHALL appear

#### Scenario: Empty MEMORY subcard is hidden when all claims' `shouldRender` returns false
- **WHEN** a desktop session card is rendered and at least one plugin claims `session-card-memory`
- **AND** every such claim declares a `shouldRender(session)` that returns `false`
- **THEN** no element with title text `MEMORY` SHALL appear

#### Scenario: MEMORY subcard appears when at least one claim's `shouldRender` returns true
- **WHEN** at least one `session-card-memory` claim's `shouldRender(session)` returns `true` (or the claim has no `shouldRender` declared)
- **THEN** an element with title text `MEMORY` SHALL appear
- **AND** only the claims whose `shouldRender` returned `true` (or which have no `shouldRender`) SHALL be mounted inside it

#### Scenario: Empty OPENSPEC subcard is hidden when handlers absent
- **WHEN** a desktop session card is rendered without `openspecChanges` or `onAttachProposal`
- **THEN** no element with title text `OPENSPEC` SHALL appear

#### Scenario: OPENSPEC subcard hides when global openspec.enabled is false
- **WHEN** a desktop session card is rendered for a session whose cwd has an `openspec/` directory (`OpenSpecData.initialized === true`)
- **AND** `DashboardConfig.openspec.enabled` is `false`
- **THEN** no element with title text `OPENSPEC` SHALL appear

#### Scenario: OPENSPEC subcard hides when cwd has no openspec directory
- **WHEN** a desktop session card is rendered for a session whose `OpenSpecData` is `{ initialized: false, pending: false, hasOpenspecDir: false, changes: [] }`
- **AND** `DashboardConfig.openspec.enabled` is `true`
- **THEN** no element with title text `OPENSPEC` SHALL appear

#### Scenario: OPENSPEC subcard shows when openspec/ exists but openspec/changes/ does not (fresh init)
- **WHEN** a desktop session card is rendered for a session whose `OpenSpecData` is `{ initialized: false, pending: false, hasOpenspecDir: true, changes: [] }` (typical of a project where `openspec init` was run but no proposals have been authored)
- **AND** `DashboardConfig.openspec.enabled` is `true`
- **THEN** an element with title text `OPENSPEC` SHALL appear (init/attach CTA)

#### Scenario: OPENSPEC subcard shows during initial poll (pending state)
- **WHEN** a desktop session card is rendered for a session whose `OpenSpecData.pending` is `true`
- **AND** `DashboardConfig.openspec.enabled` is `true`
- **THEN** an element with title text `OPENSPEC` SHALL appear

#### Scenario: OPENSPEC subcard shows when openspec/ exists but no proposal attached
- **WHEN** a desktop session card is rendered for a session whose cwd has an `openspec/` directory (`OpenSpecData.initialized === true`)
- **AND** `session.openspecChange` is null and `openspecChanges` is empty
- **AND** `DashboardConfig.openspec.enabled` is `true`
- **THEN** an element with title text `OPENSPEC` SHALL appear (preserving the attach/init CTA affordance)

#### Scenario: Old client without initialized signal preserves current visibility
- **WHEN** a desktop session card is rendered without an `openspecData` / `openspecInitialized` prop being passed by the parent
- **AND** `DashboardConfig.openspec.enabled` is `true`
- **AND** the existing prop guard (`openspecChanges && onSendPrompt && onAttachProposal && onDetachProposal`) passes
- **THEN** the OPENSPEC subcard SHALL render (do not regress existing call sites that have not yet been migrated)
