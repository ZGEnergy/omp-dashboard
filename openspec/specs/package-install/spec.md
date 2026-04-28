## Purpose

Install, remove, and update pi packages (extensions, skills, themes, prompts) via REST + WebSocket. Surfaces a single-flight server contract with an FIFO client-side queue so multiple rapid clicks survive without orphaned spinners.
## Requirements
### Requirement: Server installs pi packages via PackageManager
The server SHALL expose `POST /api/packages/install` accepting `{ source, scope, cwd? }`. It SHALL use pi's `DefaultPackageManager` to install the package. For `scope: "global"` it installs to `~/.pi/agent/settings.json`. For `scope: "local"` it installs to `<cwd>/.pi/settings.json`. The endpoint SHALL return immediately with an `operationId` and stream progress via WebSocket.

#### Scenario: Install npm package globally
- **WHEN** client sends `POST /api/packages/install` with `{ source: "npm:pi-doom", scope: "global" }`
- **THEN** server calls `packageManager.installAndPersist("npm:pi-doom")` and returns `{ operationId }` with status 202

#### Scenario: Install npm package locally
- **WHEN** client sends `POST /api/packages/install` with `{ source: "npm:pi-tools", scope: "local", cwd: "/path/to/project" }`
- **THEN** server calls `packageManager.installAndPersist("npm:pi-tools", { local: true })` scoped to the given cwd

#### Scenario: Install git package
- **WHEN** client sends `POST /api/packages/install` with `{ source: "git:github.com/user/repo", scope: "global" }`
- **THEN** server installs via git clone and persists to settings

#### Scenario: Concurrent install rejected
- **WHEN** an install/remove/update operation is already running
- **THEN** server returns 409 Conflict

### Requirement: Server serializes package operations
The server SHALL allow only one package operation (install, remove, or update) at a time. Concurrent requests SHALL receive a 409 Conflict response.

#### Scenario: Second operation during active operation
- **WHEN** an install is in progress and another install request arrives
- **THEN** the second request receives 409 with message "A package operation is already in progress"

### Requirement: Package card reflects install state immediately
After a package install, remove, or update operation completes successfully, ALL instances of the installed packages list SHALL refresh automatically. The `useInstalledPackages` hook SHALL listen for `pi-package-event` DOM events and re-fetch the installed packages list when any operation completes with `success: true`.

#### Scenario: Install from browse updates card to installed state
- **WHEN** a package is installed via the Browse Packages section
- **THEN** the PackageCard for that package immediately shows "Installed" status
- **AND** no manual page refresh is required

#### Scenario: Uninstall updates card to uninstalled state
- **WHEN** a package is uninstalled from the Installed Packages section
- **THEN** the PackageCard in Browse Packages immediately shows the Install button
- **AND** no manual page refresh is required

#### Scenario: Cross-component state sync
- **WHEN** an install operation is triggered by one component (e.g., GlobalPackagesSection)
- **THEN** other components using `useInstalledPackages` (e.g., PackageBrowser) also update

### Requirement: Client queues package operations FIFO

The dashboard client SHALL maintain a single FIFO queue of package operations (install, remove, update) shared across all components. At most one operation SHALL be in-flight to the server at any time. Subsequent enqueued operations SHALL be POSTed to `/api/packages/install|remove|update` only after the previous operation's `package_operation_complete` WebSocket message arrives.

#### Scenario: Spinner survives a second click during an active install

- **WHEN** the user clicks Install on package A and, before A completes, clicks Install on package B
- **THEN** package A's row continues to show its spinner until A's `package_operation_complete` arrives
- **AND** package B's row shows a "queued" indicator until A completes, then transitions to spinner

#### Scenario: FIFO order across components

- **WHEN** the user clicks Install on A in the Recommended Extensions panel and then on B in the Packages tab before A completes
- **THEN** A is POSTed first, A completes, then B is POSTed — regardless of which component initiated each click

#### Scenario: Completion advances the queue

- **WHEN** the running operation's `package_operation_complete` WebSocket message arrives (either `success: true` or `success: false`)
- **THEN** the next queued operation is shifted from the queue and POSTed within one event-loop tick

#### Scenario: Idle queue accepts immediately

- **WHEN** the user clicks Install on a package with no operations running or queued
- **THEN** the operation is POSTed immediately without entering the queued state visibly

### Requirement: Per-source state is shared across components

The client SHALL expose per-source operation state (`idle | queued | running | success | error`) from a single source of truth. Multiple mounted components SHALL observe the same state for the same `source` string.

#### Scenario: Recommended panel reflects an op started in Packages tab

- **WHEN** an install for `npm:pi-flows` is started from the Packages tab
- **THEN** the matching card in the Recommended Extensions panel (if mounted) shows the same spinner and status text

#### Scenario: Component unmount does not orphan an op

- **WHEN** the component that initiated an install unmounts before completion
- **THEN** the operation continues to run on the server
- **AND** completion advances the shared queue and refreshes installed-packages lists

### Requirement: Duplicate enqueue is a no-op

When a `source` is already in the `queued` or `running` state, a subsequent enqueue request for the same `source` SHALL be ignored. The status pill SHALL remain on its current value.

#### Scenario: Double-click on Install button

- **WHEN** the user clicks Install on a package twice in rapid succession
- **THEN** exactly one operation is POSTed for that package

#### Scenario: Install all overlapping with manual click

- **WHEN** the user has clicked Install on package A, then clicks "Install all missing" which would also enqueue A
- **THEN** A is enqueued exactly once and runs exactly once

### Requirement: Queue retries once on 409 PackageOperationBusy

When the server returns HTTP 409 (`PackageOperationBusyError`) for an operation POSTed by the queue, the client SHALL re-queue the request at the head of the queue and retry once after at least 500 ms. A second 409 SHALL surface as an `error` state for that source.

#### Scenario: Transient 409 retried successfully

- **WHEN** the queue POSTs operation A and the server returns 409 because an unrelated subsystem briefly held the lock
- **AND** the lock is released within 500 ms
- **THEN** the queue retries A and A succeeds normally without user intervention

#### Scenario: Persistent 409 surfaces as error

- **WHEN** two consecutive POSTs for the same operation both return 409
- **THEN** the source enters `error` state with the server's error message
- **AND** the queue advances to the next item

### Requirement: Recommended Extensions exposes Install-all-missing action

The Recommended Extensions panel SHALL show an "Install all missing" button in its header. When clicked, the button SHALL enqueue every recommended entry where `activeInPi === false`, in manifest order, using each entry's `installed.scope` if present, otherwise the panel's current scope. The button SHALL be disabled when no missing entries exist or when every missing entry is already queued or running.

#### Scenario: Button enqueues all missing entries

- **WHEN** the recommended manifest contains 3 entries, 2 of which have `activeInPi === false`
- **AND** the user clicks "Install all missing"
- **THEN** the 2 missing entries are enqueued in manifest order
- **AND** the entry that is already active is not enqueued

#### Scenario: Button respects per-entry installed scope

- **WHEN** "Install all missing" enqueues an entry whose `installed.scope === "global"`
- **THEN** that entry's POST uses `scope: "global"` regardless of the panel's current scope toggle

#### Scenario: Button disabled when nothing to do

- **WHEN** every recommended entry has `activeInPi === true`
- **THEN** the "Install all missing" button is disabled
- **AND** its tooltip indicates nothing to install

#### Scenario: Button disabled while batch in flight

- **WHEN** "Install all missing" has just been clicked and all missing entries are now in `queued` or `running` state
- **THEN** the button is disabled
- **AND** becomes enabled again only if a new missing entry appears (e.g., via a `package_operation_complete` that uninstalls one)

### Requirement: PackageBrowser banner reports queue depth

The PackageBrowser status banner SHALL display the currently running operation's source plus the number of queued operations when the queue is non-empty.

#### Scenario: Single in-flight operation, empty queue

- **WHEN** one install is running and zero are queued
- **THEN** the banner reads "Installing &lt;source&gt;…" with no queue suffix

#### Scenario: Operation running with queued items

- **WHEN** one install is running and 2 are queued
- **THEN** the banner reads "Installing &lt;source&gt;… (2 queued)"

#### Scenario: Banner clears when queue empties

- **WHEN** the last running operation completes successfully and the queue is empty
- **THEN** the banner shows the existing 3-second success state, then hides — matching today's behavior

### Requirement: Queue matches completion regardless of POST/WS arrival order

The client queue SHALL correctly match a `package_operation_complete` WebSocket message to its in-flight operation regardless of whether the message arrives before or after the corresponding HTTP POST response has resolved. When `running.operationId` is `null` (HTTP response not yet parsed), the queue SHALL match by `source` instead. When `running.operationId` is set, the queue SHALL continue to match by `operationId`.

This requirement closes a race window: for fast operations (notably local-path installs that have no network round-trip), the server's WebSocket broadcast can arrive before `fetch()` resolves the HTTP response body. Strict `operationId` matching during that window silently discards legitimate completions, leaving the spinner stuck and the queue blocked.

The same matching rule SHALL apply to `package_progress` messages so progress updates during the same window are not lost.

#### Scenario: Completion arrives before HTTP response (fast install)

- **WHEN** the queue starts an install operation by POSTing to `/api/packages/install`
- **AND** the server broadcasts `package_operation_complete` with the issued `operationId` BEFORE the client's `fetch()` resolves the response body
- **THEN** the queue matches the completion by `source` (since `running.operationId` is still `null`)
- **AND** the running op transitions to `success` (or `error` per the message payload)
- **AND** the spinner clears within one render tick

#### Scenario: Completion arrives after HTTP response (normal install)

- **WHEN** the queue starts an install operation
- **AND** the HTTP response resolves first, setting `running.operationId` to the issued id
- **AND** the server later broadcasts `package_operation_complete` with that same id
- **THEN** the queue matches by `operationId` and completes normally

#### Scenario: Progress event during race window updates running message

- **WHEN** the queue is mid-POST for an operation whose `running.operationId` is still `null`
- **AND** a `package_progress` message for that operation arrives via WebSocket
- **THEN** the queue updates `running.message` based on the progress event using `source` to match
- **AND** later progress messages (after `operationId` is set) match by `operationId` as before

#### Scenario: Local-path install does not orphan its spinner

- **WHEN** the user clicks Install on a local-path source (e.g. `/home/user/my-extension`)
- **AND** the install completes server-side in milliseconds, faster than the HTTP response round-trip
- **THEN** the spinner clears on completion and does not remain in the `running` state indefinitely
- **AND** subsequent enqueues for any other source proceed normally

#### Scenario: Mismatched completion is still ignored

- **WHEN** a `package_operation_complete` arrives whose `operationId` does not match `running.operationId` AND whose `source` does not match `running.source`
- **THEN** the queue ignores the message and the running op is unaffected

