# internal-monaco-editor-pane — delta

## MODIFIED Requirements

### Requirement: Pane SHALL open at a per-session route

The dashboard SHALL expose a route `/session/:id/editor?file=<relPath>&line=<n>` that
renders the internal editor pane for the named session. The pane SHALL be mountable
**inside the chat + editor split** (co-existing with `ChatView`), not only as a
full-screen replacement of `ChatView`. Entering the route SHALL open the split (via the
`openInSplit` helper) and render the pane alongside `ChatView`. The route SHALL be
parseable from inbound URLs (browser back/forward, copied URLs) and SHALL restore the
pane state from `localStorage` on mount.

When the route is entered with a `file` query parameter, the named file SHALL be opened
in a new (or existing if already open) tab and that tab SHALL become active. When `line`
is provided, the active viewer SHALL scroll to that line (1-indexed).

A close/unsplit affordance SHALL exist in the pane header. Activating it SHALL close the
split (returning the content area to `ChatView`) without destroying the persisted pane
state.

#### Scenario: Route opens the pane inside the split
- **GIVEN** a session `abc123` whose cwd is `/Users/u/proj`
- **WHEN** the user navigates to `/session/abc123/editor?file=src/foo.ts&line=42`
- **THEN** the split opens and the editor pane renders alongside `ChatView`
- **AND** `src/foo.ts` is open in an active tab, scrolled so line 42 is visible

#### Scenario: Close affordance unsplits without destroying pane state
- **GIVEN** the pane is open in the split with three tabs
- **WHEN** the user activates the close/unsplit affordance in the pane header
- **THEN** the content area renders `ChatView` alone
- **AND** the three tabs remain in `localStorage`
- **AND** re-opening the split restores the three tabs and the previously active one

### Requirement: Pane SHALL host a collapsible file-tree rail

The pane SHALL render a file-tree browse rail on the left, rooted at the session's
`cwd`. The rail SHALL be collapsible via a toggle button in the pane header. When
collapsed, the rail SHALL hide entirely and the viewer SHALL expand to fill the freed
width.

The boundary between the browse rail and the viewer SHALL be a draggable divider that
resizes the rail width **independently of the outer chat/editor split divider**. The
rail width SHALL be clamped so neither the rail nor the viewer collapses below a usable
minimum, and SHALL persist per session in `localStorage` alongside the existing pane
state. Re-expanding a collapsed rail SHALL restore the persisted width.

Directories in the tree SHALL be lazily expanded — clicking a folder SHALL issue a
`GET /api/browse` request for that folder's contents and render the children inline.
Expanded directories SHALL persist across reloads via `treeOpenRoots` in `localStorage`.

Clicking a file in the tree SHALL invoke `openFile(relPath, viewer)` where `viewer` is
determined by the shared file-kind classifier.

#### Scenario: Dragging the inner divider resizes the browse rail
- **GIVEN** the pane is split with the browse rail at its default width
- **WHEN** the user drags the divider between the rail and the viewer to the right
- **THEN** the browse rail widens and the viewer narrows by the same amount
- **AND** the outer chat/editor split ratio is unchanged
- **AND** the drag stops at the clamp boundary before either side collapses

#### Scenario: Rail width persists across reload
- **GIVEN** the user resized the browse rail to 260px
- **WHEN** the page reloads and the pane re-opens
- **THEN** the browse rail renders at 260px

#### Scenario: Lazy expansion fetches children on first click
- **GIVEN** the tree shows the root cwd with directories `src/`, `docs/`, `tests/` collapsed
- **WHEN** the user clicks `src/`
- **THEN** a `GET /api/browse` request is issued for `<cwd>/src`
- **AND** the children of `src` render inline beneath the folder
- **AND** `src` is added to `treeOpenRoots` in `localStorage`

#### Scenario: Collapsed rail hides tree and expands viewer
- **GIVEN** the rail is open and the viewer occupies part of the pane width
- **WHEN** the user clicks the tree-toggle button
- **THEN** the rail hides entirely
- **AND** the viewer occupies the full pane width
- **AND** the toggle button remains visible to re-open the rail

## ADDED Requirements

### Requirement: Pane SHALL surface a changed-on-disk banner for open files

The server SHALL watch the files currently open in a session's editor pane and emit a
`file_changed` signal when an open file changes on disk (e.g. an agent edit or an
external change). On receiving the signal for an open tab, the pane SHALL display a
per-tab banner stating the file changed on disk and offering a **Refresh** action. The
pane SHALL NOT auto-reload the buffer (preserving the read-only-v1 no-auto-refresh
decision); Refresh SHALL re-fetch via the existing manual-refresh path. Dismissing the
banner SHALL leave the cached (stale) view in place.

The watch SHALL be scoped to the pane's **open files only** — not the whole `cwd` tree
— and SHALL be created and torn down as tabs open and close, on session switch, and on
client disconnect, so no file descriptors leak.

#### Scenario: Agent edit to an open file shows the banner
- **GIVEN** `foo.ts` is open in the pane and unchanged on disk
- **WHEN** the agent writes new content to `foo.ts`
- **THEN** the pane displays a changed-on-disk banner on the `foo.ts` tab
- **AND** the buffer content is NOT auto-reloaded

#### Scenario: Refresh re-fetches the changed file
- **GIVEN** the changed-on-disk banner is shown for `foo.ts`
- **WHEN** the user activates Refresh
- **THEN** the pane re-fetches `GET /api/file?cwd=<cwd>&path=foo.ts`
- **AND** the Monaco buffer updates to the new content
- **AND** the banner clears

#### Scenario: Closing a tab tears down its watch
- **GIVEN** `foo.ts` and `bar.ts` are open with active watches
- **WHEN** the user closes the `foo.ts` tab
- **THEN** the watch on `foo.ts` is torn down
- **AND** the watch on `bar.ts` remains active

#### Scenario: Change to a non-open file does not signal
- **GIVEN** only `foo.ts` is open in the pane
- **WHEN** an unrelated file `baz.ts` (not open) changes on disk
- **THEN** no changed-on-disk banner is shown
