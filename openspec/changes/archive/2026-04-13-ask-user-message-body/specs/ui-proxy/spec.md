## ADDED Requirements

### Requirement: ui-proxy forwards message in params
The ui-proxy's `input`, `select`, and `multiselect` wrappers SHALL extract `message` from the `opts` bag and include it in the `extension_ui_request` params dict sent to the server.

#### Scenario: input with message
- **WHEN** `wrappedUi.input(title, placeholder, { message: "detailed text" })` is called
- **THEN** the `extension_ui_request` params SHALL be `{ title, placeholder, message: "detailed text" }`

#### Scenario: select with message
- **WHEN** `wrappedUi.select(title, options, { message: "context" })` is called
- **THEN** the `extension_ui_request` params SHALL be `{ title, options, message: "context" }`

#### Scenario: multiselect with message
- **WHEN** `wrappedUi.multiselect(title, options, { message: "instructions" })` is called  
- **THEN** the `extension_ui_request` params SHALL be `{ title, options, message: "instructions" }`

#### Scenario: no message in opts
- **WHEN** any method is called without `opts.message`
- **THEN** the params dict SHALL NOT include a `message` key (or it SHALL be undefined)

### Requirement: TUI fallback includes message in title
When racing with TUI and `message` is provided, the TUI call SHALL concatenate `title + "\n\n" + message` as the title string so the full question is visible in the terminal.

#### Scenario: input with message in TUI mode
- **WHEN** `wrappedUi.input("Check log", placeholder, { message: "Run:\n```\ntype log.txt\n```" })` is called with `hasUI: true`
- **THEN** the TUI `originalInput` call SHALL receive `"Check log\n\nRun:\n```\ntype log.txt\n```"` as the title
