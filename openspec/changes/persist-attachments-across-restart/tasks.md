## 1. Merge persisted fields on re-register

- [ ] 1.1 Write test: re-registering a session preserves `attachedProposal` from restored session
- [ ] 1.2 Write test: re-registering preserves `name` when extension doesn't provide one
- [ ] 1.3 Write test: re-registering with extension-provided name uses new name
- [ ] 1.4 Write test: fresh registration (no existing session) works normally
- [ ] 1.5 Implement merge logic in `register()` in `memory-session-manager.ts`: check for existing session, carry over `attachedProposal` and `name` (when not provided)

## 2. Docs

- [ ] 2.1 Update AGENTS.md and docs/architecture.md if needed
