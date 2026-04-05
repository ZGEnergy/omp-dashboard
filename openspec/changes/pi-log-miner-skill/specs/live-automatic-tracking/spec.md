## ADDED Requirements

### Requirement: Event-driven round accumulation
The server SHALL hook into `agent_end` events in event-wiring for sessions with live tracking enabled. Each completed agent round (user prompt → agent idle) SHALL be accumulated in a per-session in-memory buffer.

#### Scenario: Agent round completes with tracking on
- **WHEN** a session has live tracking enabled and an `agent_end` event fires
- **THEN** the round's messages are extracted from the event store and appended to the session's accumulation buffer

#### Scenario: Agent round completes with tracking off
- **WHEN** a session has live tracking disabled and an `agent_end` event fires
- **THEN** no accumulation occurs for that session

### Requirement: Debounced analysis trigger
The system SHALL trigger analysis of accumulated rounds when any of these conditions is met: (1) topic change detected by heuristics, (2) N rounds buffered (default 3), (3) session idle for 30 seconds after last `agent_end`.

#### Scenario: Topic change triggers analysis
- **WHEN** 2 rounds are buffered and the topic detector marks a topic boundary on the second round
- **THEN** the system triggers analysis immediately without waiting for the buffer threshold

#### Scenario: Buffer threshold triggers analysis
- **WHEN** 3 rounds are buffered and no topic change was detected
- **THEN** the system triggers analysis of all 3 buffered rounds

#### Scenario: Idle timeout triggers analysis
- **WHEN** 1 round is buffered and 30 seconds pass with no new `agent_end` event
- **THEN** the system triggers analysis of the single buffered round

### Requirement: Incremental rolling summary
Each analysis batch SHALL fork the knowledge seed, send the buffered rounds with the current rolling summary, and update the in-memory rolling summary with the results. The rolling summary SHALL be maintained per session in server memory.

#### Scenario: First analysis batch for a session
- **WHEN** the first analysis batch runs for a session
- **THEN** the fork receives an empty rolling summary and the response establishes the initial topic and summary

#### Scenario: Subsequent analysis batch
- **WHEN** a later analysis batch runs
- **THEN** the fork receives the accumulated rolling summary and the response appends to or creates new topic sections

### Requirement: Dual output to markdown and Honcho
Each analysis batch SHALL write extracted conclusions to Honcho (if available) AND update the in-memory rolling summary. On session end or tracking toggle-off, the rolling summary SHALL be persisted to `.pi/memories/session-summaries/<session-id>.md`.

#### Scenario: Session ends with live tracking on
- **WHEN** a session with live tracking on receives an unregister/end event
- **THEN** the system persists the rolling summary as a markdown report and stores final conclusions in Honcho

#### Scenario: User toggles tracking off mid-session
- **WHEN** the user switches the live tracking toggle off
- **THEN** the system persists the current rolling summary as a markdown report and stops accumulating

#### Scenario: Honcho unavailable during live tracking
- **WHEN** Honcho is not connected
- **THEN** the system still maintains the in-memory rolling summary and writes the markdown report, skipping Honcho conclusion storage

### Requirement: Per-session toggle with global default
Each session SHALL have a live tracking toggle. The initial state SHALL be determined by the `honcho.liveTrackingDefault` setting from the dashboard config. The per-session state SHALL be stored in server memory only (not persisted).

#### Scenario: New session with default ON
- **WHEN** a session registers and `honcho.liveTrackingDefault` is `true`
- **THEN** live tracking is enabled for that session

#### Scenario: New session with default OFF
- **WHEN** a session registers and `honcho.liveTrackingDefault` is `false`
- **THEN** live tracking is disabled for that session

#### Scenario: Default value
- **WHEN** no `honcho.liveTrackingDefault` is set in config
- **THEN** the default is `true` (live tracking ON by default)

#### Scenario: User toggles tracking for one session
- **WHEN** the user enables tracking for session A while session B has tracking disabled
- **THEN** only session A accumulates rounds and triggers analysis

#### Scenario: Server restarts
- **WHEN** the server restarts and sessions reconnect
- **THEN** all sessions revert to the global default toggle state

### Requirement: Toggle in session content-area header
The session header in the content area SHALL display a toggle switch for live knowledge tracking. The toggle SHALL show green when active.

#### Scenario: Toggle visible for active session
- **WHEN** the user views an active session's content area
- **THEN** a toggle switch labeled "Knowledge Tracking" (or brain icon) is visible in the header

#### Scenario: Toggle not shown for ended sessions
- **WHEN** the user views an ended session's content area
- **THEN** the toggle is not displayed (use manual Summarize instead)

#### Scenario: User toggles on
- **WHEN** the user switches the toggle on
- **THEN** the server begins accumulating rounds for that session and the toggle shows green

### Requirement: Live tracking default in settings
The Settings panel SHALL include a "Live Knowledge Tracking" toggle in the Honcho section that controls `honcho.liveTrackingDefault`.

#### Scenario: User enables default
- **WHEN** the user enables "Live Knowledge Tracking" in settings and saves
- **THEN** new sessions start with live tracking on by default
