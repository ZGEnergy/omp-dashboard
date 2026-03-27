## Why

The "+ New Change" button is at the bottom of the OpenSpec changes list, far from the section header. It should be next to "Bulk Archive" in the header row for quick access.

## What Changes

- Move the "+ New Change" button from below the changes list to the OpenSpec section header row, alongside the "Bulk Archive" button.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `openspec-card-section`: The "+ New Change" button moves from list footer to the section header row.

## Impact

- **Client** (`src/client/components/OpenSpecSection.tsx` or equivalent): Relocate the "+ New Change" button into the header row next to "Bulk Archive".
