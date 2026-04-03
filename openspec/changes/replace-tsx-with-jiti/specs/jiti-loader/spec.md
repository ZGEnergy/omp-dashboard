## ADDED Requirements

### Requirement: Resolve jiti register path from pi installation
The system SHALL provide a `resolveJitiRegisterPath()` function that returns the absolute filesystem path to pi's bundled `jiti-register.mjs` file. The function SHALL first attempt `import.meta.resolve('@mariozechner/jiti/register')` and, if that fails, fall back to locating the `pi` binary via PATH, following symlinks to derive the `pi-coding-agent` package root, then resolving `node_modules/@mariozechner/jiti/lib/jiti-register.mjs`.

#### Scenario: Resolution inside pi process
- **WHEN** `resolveJitiRegisterPath()` is called from code running inside a pi session (extension context)
- **THEN** it SHALL return the absolute path to `jiti-register.mjs` via `import.meta.resolve`

#### Scenario: Resolution outside pi process via PATH
- **WHEN** `resolveJitiRegisterPath()` is called from a standalone Node.js process where `pi` is on PATH
- **THEN** it SHALL locate the `pi` binary, follow symlinks to find the `pi-coding-agent` package, and return the absolute path to `jiti-register.mjs`

#### Scenario: Pi not found
- **WHEN** `resolveJitiRegisterPath()` is called and neither `import.meta.resolve` succeeds nor `pi` is found on PATH
- **THEN** it SHALL throw an error with a message indicating that pi must be installed

### Requirement: Build spawn arguments with jiti loader
The system SHALL provide a `getJitiImportArgs(scriptPath: string)` function that returns the array `["--import", <resolved-jiti-path>, scriptPath]` suitable for passing to `child_process.spawn()`.

#### Scenario: Generate spawn args
- **WHEN** `getJitiImportArgs("src/server/cli.ts")` is called
- **THEN** it SHALL return `["--import", "<absolute-path-to-jiti-register.mjs>", "src/server/cli.ts"]`
