## 1. Component string replacements

- [x] 1.1 In `packages/client/src/components/SessionOpenSpecActions.tsx`, replace `/opsx:continue` → `/skill:openspec-continue-change` (Continue button)
- [x] 1.2 Same file, replace `/opsx:ff` → `/skill:openspec-ff-change` (FF button)
- [x] 1.3 Same file, replace `/opsx:apply` → `/skill:openspec-apply-change` (Apply button)
- [x] 1.4 Same file, replace `/opsx:verify` → `/skill:openspec-verify-change` (Verify button)
- [x] 1.5 Same file, replace both `/opsx:archive` call sites → `/skill:openspec-archive-change` (Archive button + confirm path)
- [x] 1.6 In `packages/client/src/components/MobileActionMenu.tsx`, replace `/opsx:continue|ff|apply|verify|archive` with the matching `/skill:openspec-<verb>-change` strings (5 sites)
- [x] 1.7 In `packages/client/src/components/NewChangeDialog.tsx`, replace all 4 `/opsx:new` permutations with `/skill:openspec-new-change` (name+desc, name only, desc only, neither)

## 2. Test updates

- [ ] 2.1 Update `packages/client/src/components/__tests__/SessionOpenSpecActions.test.tsx` assertions from `/opsx:<verb>` to `/skill:openspec-<verb>-change`
- [ ] 2.2 Update `packages/client/src/components/__tests__/MobileActionMenu.test.tsx` assertions accordingly
- [ ] 2.3 Update `packages/client/src/components/__tests__/NewChangeDialog.test.tsx` assertions for all 4 permutations
- [ ] 2.4 Run `npm test 2>&1 | tee /tmp/pi-test.log` and grep `/tmp/pi-test.log` for failures; fix until green

## 3. Lint guard (regression prevention)

- [ ] 3.1 Add a repo-lint test (e.g. `packages/client/src/__tests__/no-opsx-prompt-emission.test.ts`) that greps `packages/client/src/**/*.{ts,tsx}` (excluding `__tests__/` and `.pi/prompts/`) and fails if any file contains the literal string `/opsx:`
- [ ] 3.2 Verify the lint passes after task 1 completes, fails when a `/opsx:` string is reintroduced

## 4. Manual smoke test

- [ ] 4.1 `npm run build && curl -X POST http://localhost:8000/api/restart`
- [ ] 4.2 Open a session with an attached proposal; click Apply, Verify, Archive — confirm the prompts that arrive in the agent start with `/skill:openspec-`
- [ ] 4.3 Open the New Change dialog; submit with name+description — confirm `/skill:openspec-new-change <name>\n<desc>` is sent
- [ ] 4.4 On a mobile viewport, open the action menu; confirm each row sends the skill form

## 5. Docs

- [ ] 5.1 Append a one-line "skill-routed" note to the rows for `SessionOpenSpecActions.tsx`, `MobileActionMenu.tsx`, `NewChangeDialog.tsx` in `docs/file-index-client.md` (delegate to a general-purpose subagent per AGENTS.md Documentation Update Protocol)
- [ ] 5.2 No change to AGENTS.md "Key Files" rows — pointer-only annotation not warranted
