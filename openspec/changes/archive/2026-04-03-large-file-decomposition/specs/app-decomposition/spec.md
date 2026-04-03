## ADDED Requirements

### Requirement: App state hook extraction
App.tsx SHALL delegate all useState and useRef declarations to a `useAppState` hook that returns a typed state object and setter functions.

#### Scenario: State hook provides all app state
- **WHEN** App component mounts
- **THEN** useAppState returns sessions, sessionStates, terminals, openspecMap, modelsMap, and all other state slices with their setters

### Requirement: Message handler hook extraction
App.tsx SHALL delegate the ServerToBrowserMessage switch handler to a `useMessageHandler` hook that receives state setters and WebSocket send function.

#### Scenario: Message handler processes all message types
- **WHEN** a WebSocket message arrives
- **THEN** useMessageHandler dispatches to the correct state setter (session_added, event, event_replay, terminal_added, etc.) identically to the current inline handler

### Requirement: Session actions hook extraction
App.tsx SHALL delegate session action callbacks (send, abort, resume, spawn, hide, unhide, rename, shutdown, terminal create/kill/rename) to a `useSessionActions` hook.

#### Scenario: Session action callbacks work through hook
- **WHEN** user triggers a session action (e.g., send prompt, abort, resume)
- **THEN** the action callback from useSessionActions sends the correct WebSocket message and applies optimistic UI updates

### Requirement: OpenSpec actions hook extraction
App.tsx SHALL delegate OpenSpec-related callbacks (refresh, bulk archive, read artifact, attach/detach proposal) to a `useOpenSpecActions` hook.

#### Scenario: OpenSpec actions work through hook
- **WHEN** user triggers an OpenSpec action (e.g., refresh, attach proposal)
- **THEN** the action callback from useOpenSpecActions sends the correct WebSocket message

### Requirement: Content views hook extraction
App.tsx SHALL delegate content view state and fetch logic (pi resources, pi resource file preview, readme preview) to a `useContentViews` hook.

#### Scenario: Content view fetch and state through hook
- **WHEN** user opens a pi resource file or README preview
- **THEN** useContentViews manages loading state and fetches content via REST API

### Requirement: Session detail view extraction
App.tsx SHALL render the session detail area (header, token stats, content router, status bar, command input) via a `SessionDetailView` component.

#### Scenario: Session detail renders all sub-components
- **WHEN** a session is selected
- **THEN** SessionDetailView renders SessionHeader, TokenStatsBar, content area (chat/flow/preview/diff), StatusBar, and CommandInput

### Requirement: Layout component extraction
App.tsx SHALL delegate desktop and mobile layout rendering to `DesktopLayout` and `MobileLayout` components respectively.

#### Scenario: Desktop layout renders sidebar and detail
- **WHEN** viewport is desktop
- **THEN** DesktopLayout renders ResizableSidebar with SessionList alongside the content area

#### Scenario: Mobile layout renders MobileShell
- **WHEN** viewport is mobile
- **THEN** MobileLayout renders MobileShell with list panel and detail panel with correct depth and back navigation
