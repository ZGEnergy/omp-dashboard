## MODIFIED Requirements

### Requirement: Event subscription model change
The bridge extension's event subscription SHALL change from a curated whitelist to a comprehensive subscription of all pi core event types (minus exclusions). The `model_select` enrichment (adding `thinkingLevel`) and `turn_end` enrichment (adding `contextUsage`) SHALL be preserved. OpenSpec detection and stats extraction are handled server-side.

#### Scenario: All core events forwarded
- **WHEN** any pi core event fires (except `context` and `before_provider_request`)
- **THEN** it SHALL be forwarded as an `event_forward` protocol message

#### Scenario: model_select enrichment preserved
- **WHEN** a `model_select` event fires
- **THEN** it SHALL be enriched with `thinkingLevel` and forwarded as `event_forward`
