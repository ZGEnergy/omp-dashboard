## 1. Tests (TDD)

- [x] 1.1 In `packages/extension/src/__tests__/openspec-activity-detector.test.ts`, add a `describe("flag-shaped change names")` block with cases: `openspec archive --help` → `null`, `openspec new change --help` → `null`, `openspec foo --change --help` → `null`.
- [x] 1.2 Add a positive-control case in the same block: `openspec archive add-auth` → `{ changeName: "add-auth", isActive: true }` (regression guard against over-restriction).
- [x] 1.3 Run `npm test 2>&1 | tee /tmp/pi-test.log` and confirm the new flag-shaped cases FAIL while existing tests still pass.

## 2. Implementation

- [x] 2.1 In `packages/shared/src/openspec-activity-detector.ts`, inside the `if (tool === "bash")` arm, add a single guard that returns `null` whenever the captured `changeName` (from any of `CLI_CHANGE_FLAG_RE`, `CLI_ARCHIVE_RE`, `CLI_NEW_CHANGE_RE`) starts with `-`. Do NOT modify the regex character classes.
- [x] 2.2 Re-run `npm test 2>&1 | tee /tmp/pi-test.log` and confirm all openspec-activity-detector tests pass (new + existing).

## 3. Documentation

- [x] 3.1 Update `AGENTS.md`'s `src/shared/openspec-activity-detector.ts` row to mention the flag-shaped-name guard, citing this change name (`fix-openspec-flag-rename-bug`).

## 4. Verification

- [x] 4.1 Run full test suite: `npm test 2>&1 | tee /tmp/pi-test.log` then `grep -nE 'FAIL|Error|✗|✘' /tmp/pi-test.log`. Zero failures expected.
- [x] 4.2 Type-check the bridge + reload sessions: `npm run reload:check`.
- [x] 4.3 Manual smoke test: in a session with no name, run `openspec archive --help` via the chat input and confirm the session is NOT renamed to `--help` and `attachedProposal` stays unset.
