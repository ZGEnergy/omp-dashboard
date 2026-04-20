## ADDED Requirements

### Requirement: Server parses tasks.md into structured task list
The dashboard server SHALL expose `GET /api/openspec/tasks?cwd=<abs>&change=<name>` returning a JSON array of parsed tasks read from `<cwd>/openspec/changes/<name>/tasks.md`. Each task SHALL include `id`, `text`, `done`, `line` (1-indexed line number in the source file), and `group` (the nearest preceding `## ` heading).

#### Scenario: Parses unticked and ticked tasks
- **WHEN** `tasks.md` contains `- [ ] 1.1 Create module` on line 3 and `- [x] 1.2 Add dep` on line 4 under `## 1. Setup` (line 1)
- **THEN** the response SHALL include `{id:"1.1", text:"Create module", done:false, line:3, group:"1. Setup"}` and `{id:"1.2", text:"Add dep", done:true, line:4, group:"1. Setup"}`

#### Scenario: Unparseable lines omitted
- **WHEN** `tasks.md` contains a line `- foo bar` (no checkbox) mixed with valid tasks
- **THEN** the response SHALL include only the valid tasks and SHALL NOT fail the request

#### Scenario: Change directory missing
- **WHEN** `<cwd>/openspec/changes/<name>/tasks.md` does not exist
- **THEN** the server SHALL respond with HTTP 404 and body `{ success: false, error: "tasks.md not found" }`

#### Scenario: Localhost guard enforced
- **WHEN** the request originates from a non-loopback address and is not authenticated
- **THEN** the server SHALL respond with HTTP 403, identical to the behaviour of the existing `GET /api/openspec` route

### Requirement: Server toggles a single checkbox in tasks.md
The dashboard server SHALL expose `POST /api/openspec/tasks/toggle` accepting `{ cwd: string, change: string, id: string, done: boolean, line: number }`. The server SHALL rewrite the target line in `tasks.md` to flip the `[ ]` or `[x]` marker, preserving all other file content byte-for-byte.

#### Scenario: Tick an unticked task
- **WHEN** the request body is `{cwd, change, id:"8.3", done:true, line:47}` and line 47 of `tasks.md` reads `- [ ] 8.3 Manual smoke: …`
- **THEN** line 47 SHALL be rewritten to `- [x] 8.3 Manual smoke: …` and the server SHALL respond HTTP 200 with the updated `OpenSpecTask` record

#### Scenario: Line mismatch returns 409
- **WHEN** the request's `line` value no longer matches the file (e.g. the file was edited between `GET` and `POST`)
- **THEN** the server SHALL respond HTTP 409 with `{ success: false, error: "line mismatch" }` and SHALL NOT modify the file

#### Scenario: Toggle triggers an openspec refresh broadcast
- **WHEN** a toggle succeeds for change `<name>` in `<cwd>`
- **THEN** the server SHALL enqueue an immediate openspec re-poll for `<cwd>` and broadcast a fresh `openspec_update` message to subscribed browsers

#### Scenario: Malformed target line rejected
- **WHEN** the request's `line` points to a line that does not match `- [ ] ` or `- [x] `
- **THEN** the server SHALL respond HTTP 400 with `{ success: false, error: "target line is not a checkbox" }`

### Requirement: Session card renders a Tasks popover button
When a session has an attached proposal and the attached change has at least one parseable task, the `SessionOpenSpecActions` component SHALL render a `Tasks <ticked>/<total>` button in the action row that opens a popover listing every task grouped by heading, each with a native checkbox.

#### Scenario: Tasks button shows counts
- **WHEN** the attached change's `tasks.md` has 30 ticked and 33 total tasks
- **THEN** the action row SHALL show a button labelled "Tasks 30/33"

#### Scenario: Clicking opens popover with grouped tasks
- **WHEN** the user clicks the Tasks button
- **THEN** a popover SHALL open listing tasks grouped by heading, with unticked tasks visually distinguishable from ticked ones

#### Scenario: Toggling a checkbox calls the toggle endpoint
- **WHEN** the user clicks an unticked task checkbox in the popover
- **THEN** the client SHALL POST `/api/openspec/tasks/toggle` with `done:true` and update the row optimistically; on error, the row SHALL revert and surface the error text

#### Scenario: 409 refetches and retains popover
- **WHEN** the toggle endpoint responds HTTP 409 (line mismatch)
- **THEN** the client SHALL refetch `/api/openspec/tasks`, re-render the popover with fresh data, and display a short "File changed — please try again" banner

#### Scenario: No tasks hides the button
- **WHEN** the attached change's `tasks.md` contains zero parseable tasks (or the file is absent)
- **THEN** the Tasks button SHALL NOT be rendered
