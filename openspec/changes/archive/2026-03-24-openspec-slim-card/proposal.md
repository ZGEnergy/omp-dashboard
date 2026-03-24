## Why

The OpenSpec section inside session cards takes too much vertical space and uses colored dots that don't convey which artifact they represent. The section should be collapsible (collapsed by default), use letter indicators (P D S T) colored by readiness, and show task progress inline — making it slimmer and more informative at a glance.

## What Changes

- **Collapsible section**: The OpenSpec section is collapsed by default when shown on the selected/expanded session card. A `▶ OpenSpec` header with a refresh button toggles expansion. Only the header line is visible when collapsed.
- **Letter indicators**: Replace colored dots with first-letter labels (P = Proposal, D = Design, S = Specs, T = Tasks) colored by artifact status: green for done, yellow for ready, gray/dim for blocked.
- **Inline task progress**: Task count (e.g., `2/5 tasks`) moves to the end of the change name line, removing the separate line.
- **Slim change cards**: Each change is one line (name + letters + tasks) with action buttons on a second line. Remove "In Progress" and "Completed" section headers.
- **Archive action**: Any change entry can be archived via an archive button on its action row. This sends the `openspec-archive-change` command for the change.
- **Apply action**: When all artifacts (P S D T) are done (all green), an "Apply" button appears on the action row. This sends the `openspec-apply-change` command for the change.

## Capabilities

### New Capabilities
_(none)_

### Modified Capabilities
- `openspec-card-section`: Collapsible behavior, letter indicators replacing dots, inline tasks, slimmer layout, no section headers, archive action on any change, apply action when all artifacts are done

## Impact

- **Client only**: `src/client/components/OpenSpecSection.tsx` — redesign layout and replace `ArtifactDots` with `ArtifactLetters`
- **Tests**: `src/client/components/__tests__/OpenSpecSection.test.tsx` — update to match new structure
- No server, bridge, or protocol changes needed
