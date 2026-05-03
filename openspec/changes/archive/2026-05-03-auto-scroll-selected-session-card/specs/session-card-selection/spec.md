## ADDED Requirements

### Requirement: Selected session card auto-scrolls into view on background re-sort
The session list SHALL automatically scroll the currently selected session card into view ONLY when the card moves under the user due to a background state change of an unchanged selection. The scroll SHALL be a no-op when the card is already within the visible viewport.

The set of position-affecting state changes that SHALL trigger a scroll is:

- A change to the selected session's `status` field (e.g. `active` → `ended`, `ended` → `streaming`).
- A change to the selected session's `hidden` flag.
- A change to the selected session's `cwd` (folder reassignment).
- A change to the selected session's index inside its folder's `sessionOrderMap` slice.

The system SHALL NOT scroll when:

- The user clicks a different session card (or `selectedId` changes by any other mechanism after first mount). The user already knows where the card they clicked is located, and auto-scrolling would hijack their scroll position.
- A field of the selected session changes that does not affect the card's position (`currentTool`, `tokensIn`, `tokensOut`, `cost`, `model`, etc.).
- The selected card has no DOM element at the time the trigger fires (filtered out by search, in a collapsed folder, in a collapsed Ended bucket, in a collapsed Hidden disclosure). The system SHALL noop and SHALL NOT auto-expand any collapsed container.
- No session is selected.

The scroll alignment SHALL be `block: "nearest"` so that already-visible cards do not scroll. The scroll behavior SHALL be `"auto"` (instant).

#### Scenario: Selected session ends and is re-sorted
- **WHEN** the currently selected session's `status` flips to `"ended"` and a re-sort moves its card to a different position in the list
- **THEN** the session list SHALL scroll the card into view with `behavior: "auto"` and `block: "nearest"`

#### Scenario: Selected session resumed from ended
- **WHEN** the currently selected session's `status` flips from `"ended"` back to an alive value
- **THEN** the session list SHALL scroll the card into view with `behavior: "auto"`

#### Scenario: Selected session toggled hidden
- **WHEN** the currently selected session's `hidden` flag flips while it remains the selected session
- **THEN** the session list SHALL scroll the card into view with `behavior: "auto"` if and only if the card is still in the DOM
- **AND** the system SHALL NOT auto-expand the Hidden disclosure when the card has been moved into it

#### Scenario: Selected session reordered by reattach policy or drag
- **WHEN** the bridge re-registers and the configured `reattachPlacement` policy (or another reorder) changes the selected card's position in `sessionOrderMap`
- **THEN** the session list SHALL scroll the card into view with `behavior: "auto"`

#### Scenario: User clicks a different session card — no scroll
- **WHEN** the user clicks a session card whose id differs from the current `selectedId`
- **THEN** the session list SHALL NOT scroll
- **AND** the prev-selectedId tracking ref SHALL be updated so that subsequent background re-sorts of the new selection scroll correctly

#### Scenario: Programmatic selection switch — no scroll
- **WHEN** `selectedId` changes for any reason other than initial mount (e.g. App-level navigation, keyboard shortcut, clearing selection)
- **THEN** the session list SHALL NOT scroll

#### Scenario: Selected card already visible
- **WHEN** any qualifying state change fires AND the selected card is already within the visible viewport of the session list scroll container
- **THEN** the system SHALL noop (no observable scroll movement) — guaranteed by `block: "nearest"`

#### Scenario: Selected card filtered out by search
- **WHEN** the selected session is filtered out by `sessionSearch` or `workspaceFilter` and has no DOM element in the list
- **THEN** the system SHALL noop and SHALL NOT clear the search filter

#### Scenario: Selected card inside collapsed folder or bucket
- **WHEN** the selected card has been moved into a collapsed folder, a collapsed Ended bucket, or a collapsed Hidden disclosure and has no DOM element in the list
- **THEN** the system SHALL noop and SHALL NOT auto-expand the collapsed container

#### Scenario: Non-position-affecting field changes
- **WHEN** a field of the selected session changes that does not affect the card's position (for example `currentTool`, `tokensIn`, `tokensOut`, `cost`, or `model`)
- **THEN** the system SHALL NOT scroll

#### Scenario: Selected session unregistered
- **WHEN** the selected session is unregistered and removed from the `sessions` array
- **THEN** the system SHALL noop (no scroll attempted on a missing card)

### Requirement: One-shot deep-link scroll on first mount
The session list SHALL scroll the currently selected card into view exactly once on first mount, if a `selectedId` is set at that time. This handles deep-link arrival on `/session/:id` where the user has not had a chance to scroll the list manually.

After the first mount, subsequent `selectedId` changes SHALL NOT trigger a scroll (per the previous requirement).

#### Scenario: Deep-link arrival on /session/:id
- **WHEN** the dashboard mounts with `selectedId` already set (for example via a `/session/<id>` route) and the matching card is in the DOM
- **THEN** the session list SHALL scroll the card for that id into view exactly once with `behavior: "auto"` and `block: "nearest"`

#### Scenario: Mount without selection
- **WHEN** the dashboard mounts with `selectedId === undefined`
- **THEN** the session list SHALL NOT scroll on mount
- **AND** subsequent user clicks SHALL NOT trigger a scroll either

#### Scenario: First-mount deep-link card not yet in DOM
- **WHEN** the dashboard mounts with `selectedId` set but the matching card is not in the DOM (for example because the session list has not finished its first render of the relevant folder, or the card is filtered out)
- **THEN** the system SHALL noop on the mount-time scroll attempt

### Requirement: Selected card scroll fingerprint helper
The session list SHALL derive its scroll trigger from a pure helper function `selectedCardScrollFingerprint(selectedId, sessions, sessionOrderMap)` that returns a stable string when the position-affecting inputs are unchanged and a different string when any of them change.

The helper SHALL return `null` when `selectedId` is undefined OR when no session in `sessions` matches `selectedId`.

The helper SHALL be exported so it can be unit-tested without rendering the component.

The helper alone is insufficient to suppress click-driven scrolls — that suppression is the consumer's responsibility, implemented via a `useRef` that tracks the previous `selectedId`. The helper's contract is purely about producing a position-aware change signal.

#### Scenario: Helper returns null without selection
- **WHEN** `selectedCardScrollFingerprint` is called with `selectedId === undefined`
- **THEN** the helper SHALL return `null`

#### Scenario: Helper returns null when session not found
- **WHEN** `selectedCardScrollFingerprint` is called with a `selectedId` not present in `sessions`
- **THEN** the helper SHALL return `null`

#### Scenario: Helper produces stable string for unchanged inputs
- **WHEN** `selectedCardScrollFingerprint` is called twice with the same `selectedId`, an unchanged session object, and an unchanged `sessionOrderMap` slice for that session's `cwd`
- **THEN** the helper SHALL return identical strings

#### Scenario: Helper string changes when status flips
- **WHEN** the selected session's `status` changes between two calls
- **THEN** the helper's two return values SHALL differ

#### Scenario: Helper string changes when hidden toggles
- **WHEN** the selected session's `hidden` flag changes between two calls
- **THEN** the helper's two return values SHALL differ

#### Scenario: Helper string changes when cwd changes
- **WHEN** the selected session's `cwd` changes between two calls
- **THEN** the helper's two return values SHALL differ

#### Scenario: Helper string changes when order index changes
- **WHEN** the selected session's index inside `sessionOrderMap.get(session.cwd)` changes between two calls
- **THEN** the helper's two return values SHALL differ

#### Scenario: Helper string is stable for non-position-affecting changes
- **WHEN** only `currentTool`, `tokensIn`, `tokensOut`, `cost`, `model`, or any field other than `status`, `hidden`, `cwd`, or order-index changes between two calls
- **THEN** the helper's two return values SHALL be identical

### Requirement: Selected card DOM addressing
Each rendered session card root element SHALL carry a `data-session-id` attribute equal to the session's id, so that the auto-scroll effect can locate it via attribute selector without ref forwarding through `dnd-kit`'s `useSortable` wrapper.

#### Scenario: Card root carries data-session-id
- **WHEN** any session card is rendered in the session list
- **THEN** the card's root element SHALL have an attribute `data-session-id` equal to the session's `id`
