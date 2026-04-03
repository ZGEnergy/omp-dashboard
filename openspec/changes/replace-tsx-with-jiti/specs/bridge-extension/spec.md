## MODIFIED Requirements

### Requirement: Server auto-launch
The bridge extension SHALL auto-launch the dashboard server when no running server is detected. The server-launcher SHALL use `getJitiImportArgs()` from the jiti-loader module to construct spawn arguments instead of hardcoding `--import tsx`.

#### Scenario: Extension spawns server with jiti
- **WHEN** the bridge extension detects no running dashboard server and auto-starts one
- **THEN** the spawned process SHALL use `node --import <jiti-register-path> cli.ts` instead of `node --import tsx cli.ts`
