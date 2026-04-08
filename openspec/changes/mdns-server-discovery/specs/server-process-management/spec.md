## MODIFIED Requirements

### Requirement: mDNS as primary discovery for CLI status
The `pi-dashboard status` command SHALL use mDNS discovery first, falling back to PID file + health check.

#### Scenario: Status finds server via mDNS
- **WHEN** `pi-dashboard status` is run and the server is advertising on mDNS
- **THEN** it SHALL report the server as running with hostname and port from the mDNS record

#### Scenario: Status falls back to PID file
- **WHEN** `pi-dashboard status` is run and mDNS returns no results
- **THEN** it SHALL fall back to reading the PID file and probing the health endpoint
