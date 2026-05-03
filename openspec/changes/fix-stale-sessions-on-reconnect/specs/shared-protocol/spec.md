## ADDED Requirements

### Requirement: Sessions snapshot message (server to browser)

The server SHALL define a `SessionsSnapshotMessage` in the browser protocol with shape:

```ts
interface SessionsSnapshotMessage {
  type: "sessions_snapshot";
  sessions: DashboardSession[];
  orders: Record<string, string[]>; // cwd → ordered session ids
}
```

This message SHALL be a member of the `ServerToBrowserMessage` union.

#### Scenario: Snapshot type is recognized
- **WHEN** a `ServerToBrowserMessage` with `type: "sessions_snapshot"` is received by a TypeScript-typed consumer
- **THEN** the discriminated union SHALL narrow to `SessionsSnapshotMessage` exposing `sessions` and `orders` fields

#### Scenario: Snapshot carries every known session
- **WHEN** the server constructs a snapshot for a browser connect
- **THEN** `sessions` SHALL contain every entry returned by `sessionManager.listAll()` at construction time, regardless of `status` (alive AND ended)
- **AND** `orders` SHALL contain every cwd whose persisted session order is non-empty
