## ADDED Requirements

### Requirement: Honcho stack start on server startup
The dashboard server SHALL start the Honcho Docker stack during its startup sequence when Honcho is enabled and mode is "docker". The start SHALL be non-blocking and not delay the server becoming available.

#### Scenario: Server starts with Honcho docker mode
- **WHEN** the dashboard server starts and `honcho.enabled` is true and `honcho.mode` is "docker" and Docker is available
- **THEN** the server triggers `docker compose -p pi-dashboard-honcho up -d` in the background and continues startup

#### Scenario: Server starts without Docker
- **WHEN** Docker is not available on the system
- **THEN** the server logs a warning and continues without Honcho

### Requirement: Honcho stack stop on server shutdown
The dashboard server SHALL stop the Honcho Docker stack during its shutdown sequence.

#### Scenario: Server shuts down
- **WHEN** the dashboard server receives a shutdown signal
- **THEN** the server runs `docker compose -p pi-dashboard-honcho stop` before exiting

#### Scenario: Server shuts down with external Honcho
- **WHEN** the server shuts down and `honcho.mode` is "external"
- **THEN** the server does not attempt to stop any Docker containers
