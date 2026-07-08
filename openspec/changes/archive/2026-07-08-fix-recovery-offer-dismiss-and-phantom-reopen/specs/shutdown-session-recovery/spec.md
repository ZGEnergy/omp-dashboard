## MODIFIED Requirements

### Requirement: Recovery candidates SHALL be exempt from cold-start status normalization

Recovery candidates SHALL be normalized to `ended` on cold start exactly like any other non-`ended` restored session, in ALL modes (`ask`, `auto`, `off`). No mode exempts a candidate from the force-`ended` normalization. A candidate SHALL NOT linger in a non-`ended` "reopened-looking" state before the user takes an explicit action. In `ask` mode the offer carries enough metadata (session file, cwd) to resume the candidate on explicit reopen; the resume flow re-hydrates the session independently of the pre-reopen status.

#### Scenario: Candidate normalized to ended in ask mode

- **GIVEN** setting `reopenSessionsAfterShutdown = "ask"` and a recovery candidate restored on cold start
- **WHEN** the restore status-normalization step runs
- **THEN** the candidate's status SHALL be rewritten to `ended`
- **AND** the candidate SHALL still appear in the broadcast recovery offer

#### Scenario: Non-candidate normalization unchanged

- **GIVEN** a restored session that is NOT a recovery candidate and has a non-`ended` status
- **WHEN** the restore status-normalization step runs
- **THEN** its status SHALL be rewritten to `ended` exactly as today

#### Scenario: Reopen re-hydrates a normalized candidate

- **GIVEN** an `ask`-mode candidate normalized to `ended` and listed in the offer
- **WHEN** the user clicks Reopen for that candidate
- **THEN** the server SHALL resume it via the existing resume flow using the offer's session file and cwd
- **AND** the resumed session SHALL become active regardless of its pre-reopen `ended` status

### Requirement: Server SHALL offer to reopen recovery candidates gated by a setting

On cold start with at least one recovery candidate, the server's behavior SHALL be governed by the `reopenSessionsAfterShutdown` setting: `off` (do NOT classify interrupted sessions as candidates — normalize them to `ended`, so none remain in a non-`ended` "zombie" state), `ask` (normalize candidates to `ended` AND broadcast a single recovery offer to all connected clients; reopen happens ONLY on explicit user action), or `auto` (resume all candidates without prompting and WITHOUT broadcasting any offer). The default SHALL be `ask`. In `ask` mode the server SHALL clear its held pending offer after any resolving action (reopen or dismiss) so that `onConnect` replay stops.

#### Scenario: Ask mode broadcasts one offer

- **GIVEN** setting `reopenSessionsAfterShutdown = "ask"` and N ≥ 1 candidates
- **WHEN** the server completes cold-start classification
- **THEN** it SHALL broadcast exactly one recovery offer listing the N candidates to all connected clients
- **AND** SHALL NOT resume any candidate until an explicit reopen action arrives

#### Scenario: Off mode takes no action and normalizes interrupted sessions

- **GIVEN** setting `reopenSessionsAfterShutdown = "off"`
- **AND** a session that would otherwise classify as an interrupted recovery candidate
- **WHEN** cold start runs
- **THEN** the server SHALL NOT broadcast a recovery offer and SHALL NOT auto-resume
- **AND** the session's non-`ended` status SHALL be force-normalized to `ended` (no persistent zombie state)

#### Scenario: Auto mode resumes without prompting

- **GIVEN** setting `reopenSessionsAfterShutdown = "auto"` and N ≥ 1 candidates
- **WHEN** the server completes cold-start classification
- **THEN** it SHALL resume each candidate via the existing resume flow
- **AND** SHALL NOT broadcast any recovery offer or notification

#### Scenario: No candidates yields no offer

- **GIVEN** zero recovery candidates on cold start
- **WHEN** classification completes (in any setting mode)
- **THEN** the server SHALL NOT broadcast a recovery offer

#### Scenario: Pending offer cleared after a resolving action

- **GIVEN** an `ask`-mode server holding a pending recovery offer
- **WHEN** any candidate is reopened OR the offer is dismissed
- **THEN** the server SHALL discard its held pending offer
- **AND** a client that connects afterward SHALL NOT receive a replayed recovery offer

### Requirement: Ask-mode prompt SHALL surface as a sticky top-right notification

In `ask` mode the client SHALL render the recovery offer as a notification in the existing top-right notification stack (shared with dashboard toasts), NOT as a blocking modal or a full-width banner. The notification SHALL be sticky — it SHALL NOT auto-dismiss on a timer the way ordinary toasts do. It SHALL offer a single primary action to reopen the candidates and a non-destructive dismiss. Dismissing SHALL NOT delete the session `.jsonl` on disk. Dismissing SHALL send a `recovery_dismiss` message to the server so the dismissal is durable (the server consumes the liveness marker for the offered sessions), and the offer SHALL NOT re-appear on reconnect, reload, or a later server restart.

#### Scenario: Offer renders in the top-right notification stack

- **GIVEN** an `ask`-mode recovery offer is received by a client
- **WHEN** the client renders it
- **THEN** it SHALL appear in the top-right notification stack alongside any other notifications
- **AND** SHALL NOT block interaction with the dashboard beneath it

#### Scenario: Offer does not auto-time-out

- **GIVEN** a rendered recovery offer notification
- **WHEN** time passes with no user action
- **THEN** the notification SHALL remain visible (no auto-dismiss timer)

#### Scenario: Dismiss is durable and consumes the marker

- **GIVEN** a rendered recovery offer notification
- **WHEN** the user clicks the dismiss (×) action
- **THEN** the client SHALL send a `recovery_dismiss` message listing the offered session ids
- **AND** the server SHALL clear the liveness marker for each id so those sessions are never classified as candidates again
- **AND** the offer SHALL NOT re-appear on WebSocket reconnect or page reload

#### Scenario: Dismissed sessions are not re-offered after restart

- **GIVEN** an `ask`-mode offer was dismissed and its markers consumed
- **WHEN** the server is fully restarted with no new unclean shutdown
- **THEN** cold-start classification SHALL NOT produce those sessions as candidates
- **AND** no recovery offer SHALL be broadcast for them

#### Scenario: Resuming any session clears the offer

- **GIVEN** a rendered recovery offer notification that the user has not acted on
- **WHEN** the user opens or resumes any session
- **THEN** the client SHALL dismiss the recovery offer notification

#### Scenario: Offer shown once per dirty boot

- **GIVEN** a recovery offer was resolved (reopened or dismissed)
- **WHEN** no new unclean shutdown has occurred since
- **THEN** the client SHALL NOT re-show the offer
