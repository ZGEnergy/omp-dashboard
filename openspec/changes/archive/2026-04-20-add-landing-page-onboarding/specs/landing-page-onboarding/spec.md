## ADDED Requirements

### Requirement: Empty-state onboarding surface
The dashboard client SHALL render a `LandingPage` component in the main content pane whenever no session, terminal, editor, settings panel, or other primary view is selected. The `LandingPage` SHALL display three onboarding steps — Setup credentials, Add folder, Start session — each rendered in one of three states: **pending**, **done**, or **locked**, derived from the current application state.

#### Scenario: First-run user sees all guidance
- **GIVEN** no LLM provider has a non-empty `apiKey` in `/api/providers`
- **AND** no pinned directories exist
- **AND** no active sessions exist
- **WHEN** the LandingPage renders
- **THEN** Step ① "Setup credentials" SHALL be **pending** with a CTA button
- **AND** Step ② "Add folder" SHALL be **locked** with a hint identifying credentials as the unmet prerequisite
- **AND** Step ③ "Start session" SHALL be **locked** with a hint identifying a pinned folder as the unmet prerequisite

#### Scenario: Fully configured user sees compact status
- **GIVEN** at least one provider has a non-empty `apiKey`
- **AND** at least one directory is pinned
- **AND** at least one session exists
- **WHEN** the LandingPage renders
- **THEN** all three steps SHALL render as single-line done rows with a ✔ indicator
- **AND** no CTA buttons SHALL be rendered

#### Scenario: Partially configured user progresses
- **GIVEN** at least one provider has a non-empty `apiKey`
- **AND** no pinned directories exist
- **WHEN** the LandingPage renders
- **THEN** Step ① SHALL render as **done**
- **AND** Step ② SHALL render as **pending** with a CTA button
- **AND** Step ③ SHALL render as **locked**

### Requirement: Step ① Setup credentials
Step ① SHALL navigate the user to the providers tab of the settings panel when its CTA is activated.

#### Scenario: CTA routes to providers tab
- **GIVEN** Step ① is in the **pending** state
- **WHEN** the user clicks the Step ① CTA button
- **THEN** the client SHALL navigate to `/settings?tab=providers`

#### Scenario: Done state reflects provider detection
- **GIVEN** `/api/providers` returns at least one entry with a non-empty `apiKey`
- **WHEN** Step ① renders
- **THEN** it SHALL display a ✔ row with the label "Credentials configured"

### Requirement: Step ② Add folder
Step ② SHALL open the `PinDirectoryDialog` when its CTA is activated. The CTA SHALL be disabled whenever Step ① is not in the **done** state.

#### Scenario: CTA opens pin dialog
- **GIVEN** Step ② is in the **pending** state
- **WHEN** the user clicks the Step ② CTA button
- **THEN** the client SHALL invoke the app-level `onOpenPinDialog` callback, which opens `PinDirectoryDialog`

#### Scenario: Locked when credentials missing
- **GIVEN** no provider has a non-empty `apiKey`
- **WHEN** Step ② renders
- **THEN** its CTA SHALL be disabled
- **AND** a hint SHALL indicate that credentials are required

#### Scenario: Sidebar "Add folder" still works independently
- **GIVEN** any combination of credential and folder state
- **WHEN** the user clicks the sidebar "Add folder" button
- **THEN** the `PinDirectoryDialog` SHALL open normally, regardless of Step ② lock state on the LandingPage

### Requirement: Step ③ Start session
Step ③ SHALL spawn a session in the first pinned directory when its CTA is activated. The CTA SHALL be disabled whenever no directories are pinned.

#### Scenario: CTA spawns in first pinned folder
- **GIVEN** Step ③ is in the **pending** state
- **AND** the pinned directory list has `firstPinnedCwd` as its first entry
- **WHEN** the user clicks the Step ③ CTA button
- **THEN** the client SHALL invoke `onSpawnSession(firstPinnedCwd)`

#### Scenario: Locked when no folders pinned
- **GIVEN** no directories are pinned
- **WHEN** Step ③ renders
- **THEN** its CTA SHALL be disabled
- **AND** a hint SHALL indicate that a pinned folder is required

#### Scenario: Done state reflects active sessions
- **GIVEN** at least one active session exists
- **WHEN** Step ③ renders
- **THEN** it SHALL display a ✔ row with the count of active sessions

### Requirement: Providers-ready detection
The client SHALL provide a `useProvidersReady()` hook that observes BOTH `/api/providers` (OpenAI-style baseUrl+apiKey config entries) AND `/api/provider-auth/status` (pi OAuth / API-key credentials stored in `~/.pi/agent/auth.json`) and returns `{ ready, count, loading }`. `ready` SHALL be `true` if either source has at least one authenticated/keyed entry; `count` SHALL be the sum across both sources. The hook SHALL refetch on initial mount, on window `focus`, and on `provider-auth-event` custom events. When one endpoint fails, the hook SHALL still derive readiness from the other.

#### Scenario: Ready is true when any `/api/providers` entry has an API key
- **GIVEN** `/api/providers` returns `{ providers: { openai: { apiKey: "sk-..." } } }`
- **AND** `/api/provider-auth/status` returns an empty array
- **WHEN** `useProvidersReady()` resolves
- **THEN** it SHALL return `ready=true`

#### Scenario: Ready is true when any OAuth provider is authenticated
- **GIVEN** `/api/providers` returns `{ providers: {} }`
- **AND** `/api/provider-auth/status` returns `[{ authenticated: true, ... }]`
- **WHEN** `useProvidersReady()` resolves
- **THEN** it SHALL return `ready=true`

#### Scenario: Ready is false when neither source has credentials
- **GIVEN** `/api/providers` returns no entries with a non-empty apiKey
- **AND** `/api/provider-auth/status` returns entries with `authenticated: false`
- **WHEN** `useProvidersReady()` resolves
- **THEN** it SHALL return `ready=false`

#### Scenario: One endpoint failure does not hide credentials from the other
- **GIVEN** `/api/providers` fails
- **AND** `/api/provider-auth/status` returns `[{ authenticated: true }]`
- **WHEN** `useProvidersReady()` resolves
- **THEN** it SHALL return `ready=true`

#### Scenario: Refetch on provider-auth-event
- **GIVEN** the hook is mounted
- **WHEN** a `provider-auth-event` is dispatched on `window`
- **THEN** the hook SHALL refetch both endpoints and update its state
