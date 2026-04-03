## ADDED Requirements

### Requirement: Subscription handler extraction
browser-gateway.ts SHALL delegate `subscribe` and `unsubscribe` message handling (including event replay and lazy session loading) to a subscription handler module.

#### Scenario: Subscribe replays events from memory
- **WHEN** a browser subscribes to a session with events in memory
- **THEN** the subscription handler replays events in batches and sends pending UI requests

#### Scenario: Subscribe lazy-loads ended sessions
- **WHEN** a browser subscribes to an ended session not in memory
- **THEN** the subscription handler loads events from disk via DirectoryService and broadcasts them

### Requirement: Session action handler extraction
browser-gateway.ts SHALL delegate action messages (`send_prompt`, `abort`, `resume_session`, `spawn_session`, `shutdown`, `flow_control`) to a session action handler module.

#### Scenario: Send prompt forwards to pi gateway
- **WHEN** browser sends a send_prompt for an active session
- **THEN** the session action handler forwards to piGateway

#### Scenario: Send prompt to ended session triggers auto-resume
- **WHEN** browser sends a send_prompt for an ended session
- **THEN** the session action handler queues the prompt and spawns a pi process to continue

### Requirement: Session meta handler extraction
browser-gateway.ts SHALL delegate metadata messages (`rename_session`, `hide_session`, `unhide_session`, `attach_proposal`, `detach_proposal`, `fetch_content`, `list_sessions`) to a session meta handler module.

#### Scenario: Rename broadcasts update
- **WHEN** browser sends rename_session
- **THEN** the meta handler updates session manager, broadcasts to all browsers, and forwards to extension

### Requirement: Terminal handler extraction
browser-gateway.ts SHALL delegate terminal messages (`create_terminal`, `kill_terminal`, `rename_terminal`) to a terminal handler module.

#### Scenario: Create terminal spawns and broadcasts
- **WHEN** browser sends create_terminal
- **THEN** the terminal handler spawns a PTY, inserts into session order, and broadcasts terminal_added

### Requirement: Directory handler extraction
browser-gateway.ts SHALL delegate directory/preference messages (`pin_directory`, `unpin_directory`, `reorder_pinned_dirs`, `reorder_sessions`, `openspec_refresh`, `openspec_bulk_archive`, `extension_ui_response`, `request_commands`, `list_files`, `request_models`, `set_model`, `set_thinking_level`) to a directory handler module.

#### Scenario: Pin directory triggers discovery
- **WHEN** browser sends pin_directory
- **THEN** the directory handler resolves the path, persists the pin, triggers session discovery, and broadcasts the update
