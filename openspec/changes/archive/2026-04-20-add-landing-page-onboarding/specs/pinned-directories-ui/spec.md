## MODIFIED Requirements

### Requirement: Pin directory dialog ownership
The `PinDirectoryDialog` SHALL be mounted at the application root (`App.tsx`) and SHALL be opened by any component via an app-provided `onOpenPinDialog` callback. The sidebar "Add folder" button SHALL no longer own the dialog's mount state; it SHALL call `onOpenPinDialog` instead.

#### Scenario: Sidebar button triggers the shared dialog
- **GIVEN** the dashboard is mounted
- **WHEN** the user clicks the sidebar "Add folder" button
- **THEN** `SessionList` SHALL invoke `onOpenPinDialog` from its props
- **AND** the application root SHALL render `<PinDirectoryDialog>` via `DialogPortal`
- **AND** confirming a directory SHALL dispatch `{ type: "pin_directory", path }` over the WebSocket, identical to the previous behaviour

#### Scenario: LandingPage triggers the same shared dialog
- **GIVEN** the LandingPage is rendered in its empty state
- **WHEN** the user activates the Step ② "Add folder" CTA
- **THEN** `LandingPage` SHALL invoke the same `onOpenPinDialog` callback
- **AND** the `PinDirectoryDialog` SHALL appear without rendering a second instance anywhere in the tree

#### Scenario: Dialog state resets between opens
- **GIVEN** the user has opened and closed `PinDirectoryDialog` at least once
- **WHEN** the user opens it again from either entry point
- **THEN** the dialog SHALL appear with a fresh input state
