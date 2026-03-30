## Why

The `+ Change` and `Explore` buttons in `SessionOpenSpecActions` appear visually adjacent to the folder-level `Bulk Archive` button in `FolderOpenSpecSection`, making them look like folder-level actions rather than session-specific actions. This is confusing because creating a new change and exploring are session-bound operations that send prompts to a specific agent.

## What Changes

- Move `+ Change` and `Explore` buttons to render **after** the `Attach change...` combo box inside the session card, making their association with the active session visually clear
- Only show these buttons when the session is active (not ended) — already the case, just ensuring layout reinforces this
- Remove any visual ambiguity with folder-level OpenSpec controls (`Bulk Archive`, refresh)

## Capabilities

### New Capabilities
_(none)_

### Modified Capabilities
_(none — this is a pure layout/UX change within existing components)_

## Impact

- `src/client/components/SessionOpenSpecActions.tsx` — layout adjustment for button positioning
- `src/client/components/FolderOpenSpecSection.tsx` — may need minor spacing/visual separation
- No API or protocol changes
