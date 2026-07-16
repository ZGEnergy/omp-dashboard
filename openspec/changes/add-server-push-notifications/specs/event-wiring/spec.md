## MODIFIED Requirements

### Requirement: Unread-trigger evaluation site remains the single push hook

The existing unread-trigger evaluation block in `event-wiring.ts` SHALL remain the single point where push-to-device decisions are made. It evaluates `isUnreadTrigger(...)` once and, within the same any-viewer/non-replay gate, retains both unread-stripes behavior and the optional Web Push fanout. No second classifier or parallel attention pipeline SHALL be introduced.

#### Scenario: One predicate, two consumers
- **WHEN** an event satisfies `isUnreadTrigger(...)`, no browser views the session, and the event is not replay
- **THEN** the unread bit SHALL be set according to existing behavior
- **AND** `pushDispatcher?.fanout(sessionId, event)` SHALL be called within that same gated branch

#### Scenario: Input-needed trigger uses existing predicate
- **WHEN** `currentTool` changes to `ask_user` or core `ask` from a non-input-needed tool under the same gate
- **THEN** the shared predicate SHALL qualify the event once
- **AND** the existing unread and push consumers SHALL use that one result

#### Scenario: Predicate, viewer, or replay gate fails
- **WHEN** `isUnreadTrigger(...)` returns false, any viewer is present, or the event is replay
- **THEN** the unread bit SHALL NOT be changed by this branch
- **AND** `pushDispatcher` SHALL NOT be called

### Requirement: Optional push dispatcher dependency

`EventWiringDeps` SHALL accept an optional `pushDispatcher?: PushDispatcher` field. When undefined, wiring SHALL retain pre-push behavior with no fanout and no missing-dispatcher error. When present, it SHALL be invoked only at the gated site above.

#### Scenario: Dispatcher absent
- **WHEN** `wireEvents(...)` is called without `pushDispatcher` in deps
- **THEN** event flow SHALL behave identically to the existing path
- **AND** no error SHALL be logged for the absent optional dependency

#### Scenario: Dispatcher present
- **WHEN** `wireEvents(...)` is called with `pushDispatcher` in deps and a non-viewed, non-replay trigger arrives
- **THEN** the dispatcher SHALL be invoked once under the shared predicate gate
- **AND** the call SHALL remain fire-and-forget and non-awaited
***
