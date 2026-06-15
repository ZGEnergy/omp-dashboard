## MODIFIED Requirements

### Requirement: Worktree init run honors TOFU trust
`POST /api/git/worktree/init` SHALL run the declared `worktreeInit` hook only when
the caller-supplied confirm hash matches a recorded trust entry, otherwise it SHALL
return `init_untrusted` carrying `{ hook, hash }`. This trust gate SHALL apply
identically whether the run is triggered manually (via `WorktreeInitButton`) or
automatically (via the `autoInitWorktreeOnSpawn` preference). No caller may cause
an untrusted hook to run without an explicit user trust grant.

#### Scenario: Manual run of untrusted hook prompts for trust
- **WHEN** the user clicks Initialize on a checkout whose hook is untrusted
- **THEN** the endpoint SHALL return `init_untrusted` with the hook def and hash
- **AND** the client SHALL show a trust-confirm dialog before re-issuing with `confirmHash`

#### Scenario: Auto-trigger cannot bypass trust
- **WHEN** the `autoInitWorktreeOnSpawn` preference is ON and a spawned checkout's hook is untrusted
- **THEN** the auto-trigger SHALL NOT call the init endpoint with any forged or implied trust
- **AND** initialization SHALL only proceed via the manual, user-confirmed path
