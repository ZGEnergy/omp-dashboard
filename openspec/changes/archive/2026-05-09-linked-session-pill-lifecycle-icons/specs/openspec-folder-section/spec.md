## MODIFIED Requirements

### Requirement: Change list displays linked sessions
The expanded folder OpenSpec change list SHALL show clickable session indicators per change, displaying sessions that have `attachedProposal` matching the change name. Each linked-session row SHALL render the session name as the primary click target (jumping to that session) and SHALL render a trailing icon group exposing the session's lifecycle actions inline.

#### Scenario: Change with attached sessions
- **WHEN** change `"add-auth"` is listed in folder `/project/foo` and sessions `["s1", "s2"]` have `attachedProposal = "add-auth"`
- **THEN** the change row SHALL show clickable session names/IDs next to the change name
- **AND** each linked-session row SHALL render a trailing icon group with hide/unhide, resume (conditional), and fork (conditional) buttons

#### Scenario: Clicking session name navigates to session
- **WHEN** the user clicks the session name region in the linked-session row for `"s1"`
- **THEN** the UI SHALL navigate/scroll to session `"s1"`

#### Scenario: Change with no attached sessions
- **WHEN** change `"fix-bug"` has no sessions with `attachedProposal = "fix-bug"`
- **THEN** the change row SHALL show no session indicators

#### Scenario: Hidden attached session still appears in list with unhide icon
- **WHEN** session `"s1"` is attached to change `"add-auth"` and `s1.isHidden === true`
- **THEN** the linked-session row for `"s1"` SHALL still appear under the change
- **AND** the trailing icon group SHALL render an unhide (eye) icon
- **AND** the hide (eye-off) icon SHALL NOT render

#### Scenario: Visible attached session shows hide icon
- **WHEN** session `"s1"` is attached to change `"add-auth"` and `s1.isHidden` is false or undefined
- **THEN** the trailing icon group SHALL render a hide (eye-off) icon
- **AND** the unhide (eye) icon SHALL NOT render

#### Scenario: Resume icon visible only for resumable sessions
- **WHEN** session `"s1"` is attached to change `"add-auth"`, has `sessionFile` set, and is either not alive OR `isHidden`
- **THEN** the trailing icon group SHALL render a resume (play-circle) icon
- **WHEN** the same session is alive AND not hidden
- **THEN** the resume icon SHALL NOT render

#### Scenario: Fork icon visible whenever sessionFile exists
- **WHEN** session `"s1"` is attached to change `"add-auth"` and has `sessionFile` set
- **THEN** the trailing icon group SHALL render a fork (source-fork) icon regardless of alive/hidden state
- **WHEN** the session has no `sessionFile`
- **THEN** the fork icon SHALL NOT render

#### Scenario: Clicking a lifecycle icon does not navigate
- **WHEN** the user clicks any icon (hide, unhide, resume, fork) in the trailing icon group of a linked-session row
- **THEN** the corresponding lifecycle callback SHALL fire with the session id (and mode `"continue"` or `"fork"` for resume vs. fork)
- **AND** the session-jump navigation SHALL NOT fire (click propagation is stopped)

#### Scenario: Artifact letter colors
- **WHEN** artifacts have statuses done/ready/blocked
- **THEN** letters SHALL be green/yellow/muted respectively (same as current `OpenSpecSection`)
