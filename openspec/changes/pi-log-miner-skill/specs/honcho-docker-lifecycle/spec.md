## ADDED Requirements

### Requirement: Docker availability detection
The system SHALL detect Docker availability by running `docker compose version` at dashboard startup and cache the result.

#### Scenario: Docker available
- **WHEN** `docker compose version` succeeds
- **THEN** the system marks Docker as available and proceeds with Honcho stack management

#### Scenario: Docker not installed
- **WHEN** `docker compose version` fails
- **THEN** the system marks Docker as unavailable, logs a message, and skips Honcho stack management

### Requirement: Docker Compose file generation
The system SHALL generate a `docker-compose.yml` at `~/.pi/dashboard/honcho/` containing PostgreSQL (with pgvector) and Honcho server containers. The Honcho container SHALL be configured with `OPENAI_BASE_URL=http://host.docker.internal:9876/v1` pointing to pi-model-proxy. Auth SHALL be disabled (`AUTH_USE_AUTH=false`). The compose file SHALL include `extra_hosts: ["host.docker.internal:host-gateway"]` for Linux compatibility.

#### Scenario: First-time generation
- **WHEN** no compose file exists at the expected path
- **THEN** the system generates the file with default configuration

#### Scenario: Config port change
- **WHEN** the user changes `honcho.port` in dashboard config
- **THEN** the system regenerates the compose file with the updated port mapping on next startup

### Requirement: Auto-start with dashboard
The system SHALL start the Honcho Docker stack during dashboard server startup when `honcho.enabled` is `true` and `honcho.mode` is `"docker"`. Startup SHALL be non-blocking (background).

#### Scenario: Dashboard starts with Honcho enabled
- **WHEN** the dashboard server starts and Docker is available and Honcho is enabled in config
- **THEN** the system runs `docker compose -p pi-dashboard-honcho up -d` in the background

#### Scenario: Dashboard starts with Honcho disabled
- **WHEN** `honcho.enabled` is `false`
- **THEN** the system does not start the Honcho stack

### Requirement: Health probe before marking available
The system SHALL health-check Honcho's `/health` endpoint after starting the Docker stack. The system SHALL retry with backoff for up to 60 seconds before marking Honcho as unavailable.

#### Scenario: Honcho starts successfully
- **WHEN** the `/health` endpoint returns 200 within 60 seconds
- **THEN** the system marks Honcho as available for pipeline use

#### Scenario: Honcho fails to start
- **WHEN** the `/health` endpoint does not return 200 within 60 seconds
- **THEN** the system marks Honcho as unavailable and logs a warning

### Requirement: pi-model-proxy connectivity check
The system SHALL check pi-model-proxy health (`GET localhost:<proxyPort>/health`) before starting Honcho with reasoning features. If the proxy is unavailable, Honcho SHALL start without reasoning (deriver/summarizer/dream disabled via environment variables).

#### Scenario: Proxy available
- **WHEN** pi-model-proxy health check succeeds
- **THEN** Honcho starts with full reasoning features enabled

#### Scenario: Proxy unavailable
- **WHEN** pi-model-proxy health check fails
- **THEN** Honcho starts with reasoning features disabled (CRUD-only mode)

### Requirement: Auto-stop with dashboard
The system SHALL stop the Honcho Docker stack during dashboard shutdown via `docker compose -p pi-dashboard-honcho stop`. Containers SHALL be stopped but not removed for fast restart.

#### Scenario: Dashboard stops
- **WHEN** the dashboard server shuts down
- **THEN** the system stops the Honcho containers without removing them

### Requirement: Named volume persistence
PostgreSQL data SHALL be stored in a Docker named volume (`pi-dashboard-honcho-db`) that survives container removal.

#### Scenario: Containers removed and recreated
- **WHEN** the Docker containers are removed and recreated via `docker compose up`
- **THEN** all Honcho data (peers, sessions, conclusions) is preserved

### Requirement: External mode support
When `honcho.mode` is `"external"`, the system SHALL skip Docker lifecycle management and connect to the Honcho instance at `honcho.externalUrl`.

#### Scenario: External mode configured
- **WHEN** config has `honcho.mode: "external"` and `honcho.externalUrl: "https://api.honcho.dev"`
- **THEN** the system does not manage Docker and connects the SDK client to the external URL
