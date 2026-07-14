# session-spawn.spec.ts — index

Scenario spec 5.1, authoritative WS round-trip. Clears onboarding gate, clicks `onboarding-step-2-cta` opens `pin-directory-dialog`, fills PathPicker textbox `/fixtures/sample-git`, clicks Select, clicks `onboarding-step-3-cta` spawns, asserts `session-card-desktop` visible within 60s. Card appears only after spawned pi bridge registers over `/ws`. Requires `PI_E2E_SEED=1` (managed sets it). Refactored onto `ensureGitSession` helper; asserts returned card visible. See change: add-playwright-e2e. See change: add-e2e-spawn-scenarios.
