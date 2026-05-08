## MODIFIED Requirements

### Requirement: Bridge anchors jiti loader resolution at the active pi cli

The bridge extension SHALL resolve pi's TypeScript loader (jiti) by anchoring `createRequire` at `process.argv[1]` (the active pi cli's entry point) and probing the following package names in order:

1. `jiti` — the un-namespaced upstream package shipped by `@earendil-works/pi-coding-agent` (the primary fork).
2. `@mariozechner/jiti` — the namespaced fork shipped by `@mariozechner/pi-coding-agent` (legacy).

The bridge SHALL NOT probe `@oh-my-pi/jiti`. If neither name resolves, the bridge SHALL surface the error message "Cannot find pi's TypeScript loader (jiti). Is `@earendil-works/pi-coding-agent` or `@mariozechner/pi-coding-agent` installed?" — naming both supported forks in primary-first order, never naming `@oh-my-pi`.

#### Scenario: Earendil pi resolves bare jiti

- **WHEN** the bridge runs inside `@earendil-works/pi-coding-agent`'s Node.js process
- **THEN** `createRequire(piCli).resolve("jiti/package.json")` succeeds
- **AND** `@mariozechner/jiti` is never probed

#### Scenario: Legacy pi falls through to namespaced jiti

- **WHEN** the bridge runs inside `@mariozechner/pi-coding-agent`'s Node.js process
- **THEN** the bare-jiti probe fails fast
- **AND** `createRequire(piCli).resolve("@mariozechner/jiti/package.json")` succeeds

#### Scenario: Error message lists supported forks only

- **WHEN** neither jiti name resolves (e.g., pi is not installed)
- **THEN** the thrown error message SHALL list `@earendil-works/pi-coding-agent` and `@mariozechner/pi-coding-agent`
- **AND** SHALL NOT mention `@oh-my-pi/pi-coding-agent`
