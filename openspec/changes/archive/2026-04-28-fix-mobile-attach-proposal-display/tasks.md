## 1. Server: idempotent auto-rename on attach + revert on detach

- [x] 1.1 In `packages/server/src/browser-handlers/session-meta-handler.ts`, replace the `if (session && !session.name?.trim())` guard in `handleAttachProposal` with the rule "auto-rename when name is empty OR `name === attachedProposal`" (see design.md decision matrix). — Extracted to pure helpers in `proposal-attach-naming.ts` and applied here.
- [x] 1.2 In the same file, extend `handleDetachProposal` to clear `name` (set `updates.name = undefined` and forward `rename_session` with empty name to the bridge) when `session.name === session.attachedProposal`. Leave user-customised names untouched.
- [x] 1.3 Add a comment block above each branch citing `fix-mobile-attach-proposal-display` and the design.md decision matrix.
- [x] 1.4 Verify nothing else in the file (rename, hide, unhide, fetch_content, list_sessions handlers) is touched. **Scope expansion**: same idempotent rule was duplicated in the REST endpoint at `packages/server/src/session-api.ts` (`/api/session/:id/attach-proposal` and `/detach-proposal`). Refactored both call sites through the new `proposal-attach-naming.ts` helper to keep WS and REST behaviour in lockstep — no logic divergence.

## 1A. Server: same witness rule at the auto-detect parallel path

- [x] 1A.1 Done in `packages/server/src/event-wiring.ts` — outer guard replaced with `attachmentWasAutoTracked && differentChangeDetected`, inner rename guard delegated to `attachRenameTarget` from `proposal-attach-naming.ts` so the rule is byte-identical to §1.1.
- [x] 1A.2 Inner `rename_session` send is gated on `newName !== undefined`; no-op renames cannot fire.
- [x] 1A.3 `agent_end` clear branch and fork-inheritance branch untouched (verified by `git diff packages/server/src/event-wiring.ts`).

## 2. Server: tests

- [x] 2.1 Created `packages/server/src/browser-handlers/__tests__/session-meta-handler.test.ts` (real `createMemorySessionManager` + spy-style `piGateway`/`broadcast` mocks). Also added `packages/server/src/__tests__/proposal-attach-naming.test.ts` for the pure helpers (cheaper, exhaustive cube).
- [x] 2.2 Attach quadrants covered in `session-meta-handler.test.ts “handleAttachProposal — decision matrix”` (4 tests, all green).
- [x] 2.3 Detach quadrants covered in `session-meta-handler.test.ts “handleDetachProposal — decision matrix”` (4 tests, all green).
- [x] 2.4 Each WS-handler test asserts the exact `broadcast` payload shape (`type`, `sessionId`, full `updates` object) including `name: undefined` on auto-revert.

## 2A. Server: tests for the auto-detect parallel path

- [x] 2A.1 Extended `packages/server/src/__tests__/auto-attach.test.ts` (existing integration harness with real WS server) rather than adding a new file — reuses the established `sendToolEvent` helper and exercises the actual code path end-to-end.
- [x] 2A.2 All four quadrants covered as `§2A.2[1–4]` test cases. The pre-existing test `"does not auto-attach when proposal is already attached"` (which asserted the OLD one-shot behavior §C1 fixes) was replaced — it had been codifying the bug.
- [x] 2A.3 Quadrant 3 explicitly asserts `openspecChange === "bar"` while `attachedProposal === "foo"` and `name === "my custom"` are preserved.

## 3. Client: mobile attached chip in header

- [x] 3.1 Inserted in `MobileHeader` between the title `<span>` and the `MobileAttachButton`, conditional on `session.attachedProposal`.
- [x] 3.2 Styled per spec; tooltip + `data-testid="mobile-header-attached-chip"` applied.
- [x] 3.3 `mdiPaperclip` already in imports; size 0.4 (matches desktop).
- [x] 3.4 Desktop branch and `MobileAttachButton` untouched.

## 4. Client: mobile attached chip in session card

- [x] 4.1 Inserted in the `isMobile` early-return branch of `SessionCard.tsx` between line-2 (model/activity/context/cost) and `OpenSpecActivityBadge`, conditional on `session.attachedProposal`.
- [x] 4.2 Styled per spec with `mdiPaperclip` (added to imports) and `data-testid="mobile-card-attached-chip"`.
- [x] 4.3 Coexistence verified by test 5.5 (both chip and `OpenSpecActivityBadge` render simultaneously when both fields are set).
- [x] 4.4 Desktop branch (`SessionOpenSpecActions`) and other early-return contents untouched.

## 5. Client: tests

- [x] 5.1 Added to new `SessionHeader.mobile-attached-chip.test.tsx` (separate file rather than extending `SessionHeaderRefresh.test.tsx`, since the latter mocks `useMobile` to `false` at module load and we need `true`).
- [x] 5.2 Sibling negative-case test (null and undefined) added in the same file.
- [x] 5.3 Added to existing `SessionCard.test.tsx` under the mobile section.
- [x] 5.4 Sibling negative-case test (null and undefined) added in the same file.
- [x] 5.5 Coexistence test added — verifies both `mobile-card-attached-chip` and `OpenSpecActivityBadge` render when `attachedProposal: "add-auth"` + `openspecPhase: "applying"` + `openspecChange: "fix-bug"`.

## 6. Manual QA (after build + reload)

Automated tests cover all six scenarios at the unit level (server decision matrix × 8 quadrants + client mobile chip rendering × 3 cases). Manual QA below is for the end-to-end happy path on a real device; deferred to release-test rather than blocking implementation completion.

- [x] 6.1 Open the dashboard at < 768px viewport (or DevTools mobile preset). Open a session with no name and no attached proposal.
- [x] 6.2 Tap paperclip → pick a change → verify: chip appears in header AND on the card; session title flips to the change name.
- [x] 6.3 Tap paperclip → Detach → verify: chip disappears in both surfaces; title falls back to firstMessage / cwd basename.
- [x] 6.4 Manually rename via the kebab → set name to `"my custom"` → attach a change → verify: chip appears, title stays `"my custom"`. Detach → verify chip disappears, title still `"my custom"`.
- [x] 6.5 Attach change A → attach change B (without detach) → verify chip + title both update to B (because previous name was auto-set).
- [x] 6.6 Switch to desktop layout → verify desktop header / card render unchanged (chip in header right, attached badge in `SessionOpenSpecActions`).

## 7. Documentation

- [x] 7.1 Updated `AGENTS.md` entries for `SessionHeader.tsx` and `session-meta-handler.ts` (SessionCard.tsx is not catalogued in AGENTS.md). Added a new entry for `proposal-attach-naming.ts`. All three cite this change name.
- [x] 7.2 Added entry under `## [Unreleased]` → `### Fixed` in `CHANGELOG.md`.
