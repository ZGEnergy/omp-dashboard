## ADDED Requirements

### Requirement: Bundled pi-dashboard skill
The dashboard package SHALL include a `.pi/skills/pi-dashboard/` directory discoverable both as a local project skill (via pi's `.pi/skills/` scan) and as a package skill (via `pi.skills` in `package.json`).

#### Scenario: Skill auto-discovery
- **WHEN** the dashboard package is installed and pi scans for skills
- **THEN** the `pi-dashboard` skill SHALL appear in available skills

### Requirement: Dashboard URL auto-discovery
The skill instructions SHALL guide the agent to read `~/.pi/dashboard/config.json` to determine the server port, defaulting to `localhost:8000`.

#### Scenario: Custom port configured
- **WHEN** config.json contains `"port": 9000`
- **THEN** the agent SHALL use `http://localhost:9000` as the base URL

#### Scenario: No config file
- **WHEN** config.json does not exist
- **THEN** the agent SHALL use `http://localhost:8000` as the default base URL

### Requirement: Auth-aware API access
The skill instructions SHALL document how to handle authentication when auth is enabled, including JWT token extraction and header injection.

#### Scenario: Auth enabled
- **WHEN** the dashboard has auth configured
- **THEN** the skill SHALL instruct the agent to include the auth token in requests

#### Scenario: Auth disabled (default)
- **WHEN** no auth is configured
- **THEN** the skill SHALL instruct the agent to make requests without auth headers

### Requirement: Helper script
The skill SHALL include a `scripts/dashboard-api.sh` bash script that wraps curl with auto port detection, optional auth, JSON formatting (with graceful jq fallback), and error handling.

#### Scenario: Helper script usage
- **WHEN** the agent runs `./scripts/dashboard-api.sh GET /api/sessions`
- **THEN** the script SHALL read the port from config, make the curl request, and format the JSON response

#### Scenario: Helper script without jq
- **WHEN** jq is not installed
- **THEN** the script SHALL output raw JSON without formatting

### Requirement: Complete API reference
The skill SHALL include a `references/api-reference.md` file documenting every REST API endpoint with method, path, parameters, request body, and response format.

#### Scenario: Agent reads API reference
- **WHEN** the agent loads `references/api-reference.md`
- **THEN** it SHALL find documentation for all monitoring, session control, git, config, and tunnel endpoints

### Requirement: Orchestration recipes
The skill SHALL include a `references/recipes.md` file with practical multi-step workflows combining multiple API calls.

#### Scenario: Spawn-and-prompt recipe
- **WHEN** the agent reads the spawn-and-prompt recipe
- **THEN** it SHALL find step-by-step instructions to spawn a session, poll for active status, send a prompt, and monitor completion

#### Scenario: Health check recipe
- **WHEN** the agent reads the health-check recipe
- **THEN** it SHALL find instructions to verify server health and list session statuses

#### Scenario: Batch operations recipe
- **WHEN** the agent reads the batch-operations recipe
- **THEN** it SHALL find patterns for iterating over sessions and performing bulk actions
