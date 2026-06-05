# worktree-spawn-dialog delta

> **Layering note**: this delta assumes the `add-worktree-from-pull-request` delta has been applied first, which introduces the binary source toggle ("From a branch" / "From a pull request") on `WorktreeSpawnDialog`. This delta MODIFIES that requirement to widen the toggle to a ternary set and refine the default-mode logic.

## MODIFIED Requirements

### Requirement: From-a-pull-request creation mode

The "Create a new worktree" section of `WorktreeSpawnDialog` SHALL offer a **ternary** source toggle with three modes: **Fork to new branch**, **Check out existing branch**, and **From a pull request**. Each mode reveals its own field set; switching modes preserves picker selections where the underlying ref shape is compatible.

The three modes SHALL behave as follows:

1. **Fork to new branch** (`mode === "fork"`) — the existing fork form. Picker selects a base ref; the user types a new branch name; submit calls `createWorktree({cwd, base, newBranch, path?})`. Path is derived from `slugifyBranch(newBranch)`.

2. **Check out existing branch** (`mode === "checkout"`) — picker selects a branch ref directly; no new-branch input is rendered; submit calls `createWorktree({cwd, base, path?})` with `newBranch` omitted (the server runs `git worktree add <path> <base>` without `-b`). Path is derived from `slugifyBranch(localNameOf(base))` where `localNameOf("origin/foo") === "foo"`. The picker label SHALL read **Branch** (not **Base branch**) in this mode. `canSubmit` SHALL require only `base.trim().length > 0`.

3. **From a pull request** (`mode === "from-pr"`) — the PR-change form. `PrCombobox` selects an open PR; submit calls `POST /api/git/worktree/from-pr` with `{cwd, prNumber, path}`. Lazy-load and gh-unavailable behaviour is unchanged from the original PR-change requirement.

The new-branch input (`data-testid="worktree-new-branch-input"`) SHALL be present in the DOM only when `mode === "fork"`. The `PrCombobox` SHALL be present only when `mode === "from-pr"`.

When the server returns `branch_in_use` for a `"checkout"`-mode submit, the dialog SHALL render the full server `message` (which includes the path of the worktree currently holding the branch) inline below the picker.

#### Scenario: Three-way toggle renders in create section

- **WHEN** the dialog opens and finishes loading branches
- **THEN** a radio group with three options "Fork to new branch", "Check out existing branch", and "From a pull request" SHALL be visible inside the "Create a new worktree" section

#### Scenario: Fork mode field set

- **WHEN** `mode === "fork"`
- **THEN** the base-branch combobox, the new-branch input, and the derived-path preview SHALL render
- **AND** the new-branch input (`data-testid="worktree-new-branch-input"`) SHALL be present in the DOM
- **AND** submit SHALL call `POST /api/git/worktree` with `{cwd, base, newBranch, path?}`

#### Scenario: Checkout mode field set

- **WHEN** `mode === "checkout"`
- **THEN** the picker SHALL render with the label "Branch"
- **AND** the new-branch input SHALL NOT be present in the DOM
- **AND** the path preview SHALL render `<repo>/.worktrees/<slug(localNameOf(base))>`
- **AND** submit SHALL call `POST /api/git/worktree` with `{cwd, base, path?}` and no `newBranch` field

#### Scenario: Checkout mode renders branch_in_use with holding-worktree path

- **WHEN** `mode === "checkout"` AND the server returns `{success: false, error: "branch_in_use", message: "...at '/repo/.worktrees/bar'..."}`
- **THEN** the dialog SHALL render the full server `message` (including the path `/repo/.worktrees/bar`) inline below the picker

#### Scenario: PR mode unchanged

- **WHEN** `mode === "from-pr"`
- **THEN** the `PrCombobox`, gh-unavailable degradation, lazy-load on first activation, and `POST /api/git/worktree/from-pr` submit path SHALL behave exactly as specified by the `add-worktree-from-pull-request` change before this widening
- **AND** the binary-toggle scenarios from that change SHALL continue to hold with the option key renamed (`"from-branch"` → `"fork"`)

#### Scenario: Mode flip preserves compatible selections

- **WHEN** the user picks `base = "main"` in `"checkout"` mode AND flips to `"fork"` mode
- **THEN** the base-branch combobox SHALL retain `"main"` as the selected base
- **AND** the new-branch input SHALL render empty (or with the `attachProposal`-derived value if applicable)

### Requirement: Default mode derived from attachProposal

When `WorktreeSpawnDialog` mounts, it SHALL pick the initial `mode` based on the `attachProposal` prop, refining the original default introduced by `add-worktree-from-pull-request`:

- `attachProposal` is a non-empty string → initial `mode === "fork"`.
- `attachProposal` is `undefined` or empty → initial `mode === "checkout"`.
- `mode === "from-pr"` SHALL never be the auto-picked default (preserving the lazy-load contract from `add-worktree-from-pull-request`).

Subsequent runtime changes to `attachProposal` SHALL NOT flip the mode automatically; the user remains in control after first paint via the radio toggle.

#### Scenario: Plain +Worktree defaults to checkout

- **WHEN** the dialog mounts with `attachProposal` undefined
- **THEN** the mode selector SHALL show "Check out existing branch" as selected on first paint
- **AND** the new-branch input SHALL NOT be present in the DOM
- **AND** no PR list fetch SHALL be issued

#### Scenario: Proposal-driven +Worktree defaults to fork

- **WHEN** the dialog mounts with `attachProposal = "add-foo"`
- **THEN** the mode selector SHALL show "Fork to new branch" as selected on first paint
- **AND** the new-branch input SHALL be present with value `os/add-foo` (existing `attachProposal` behaviour from `auto-fill-branch-from-proposal-in-worktree-dialog`)

#### Scenario: User can flip mode after auto-pick

- **WHEN** the dialog mounted in `"checkout"` mode AND the user clicks the "Fork to new branch" radio
- **THEN** `mode` SHALL become `"fork"` AND the new-branch input SHALL appear
- **AND** the `base` selection SHALL be preserved across the flip

#### Scenario: attachProposal change after mount does not flip mode

- **WHEN** the dialog mounted with `attachProposal = undefined` (mode = `"checkout"`) AND the parent re-renders with `attachProposal = "add-foo"`
- **THEN** `mode` SHALL remain `"checkout"` (user-controlled after first paint)
- **AND** the existing `attachProposal`-reactivity on the branch input SHALL still apply if the user later flips to `"fork"` mode
