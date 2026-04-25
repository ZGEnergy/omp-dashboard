# Tasks

This change is **design-only**. It captures decisions and the slot taxonomy. Implementation lands in follow-up changes (one per phase). The tasks below are the design-review and scaffolding work needed before implementation can start.

## 1. Design review

- [x] 1.1 Resolve open questions in `design.md` §"Open Questions" (footer placement, toast dedup, confirm polish, icon vocab, dispose semantics, pi-flows test kind, save/discard gate scope, ragger rich view types). **Done** — all 8 questions resolved with the annotated picks confirmed; design.md §"Resolved Open Questions" now records each decision with rationale.
- [ ] 1.2 Confirm with pi-flows maintainer that Phase 3 adoption is acceptable in pi-flows scope and timeline. **Pending external coordination.**
- [ ] 1.3 Confirm with pi-judo maintainer that the explicit two-line migration is acceptable for their use cases. **Pending external coordination.**
- [x] 1.4 Validate that Phase 1's slot ergonomics cover ragger's workspace-CRUD use case (the original PR #15 motivator) without changes. **Verdict:** Phase 1 covers workspace-CRUD (table + form) ✅. Ragger's richer needs (`search`, `metrics`, `detail` view types) are beyond Phase 1's scope; tracked as Open Question §8 in `design.md` and a likely follow-up change after Phase 1 ships. Coverage matrix added to `design.md` §"Phase-1 Coverage Validation".

## 2. Scaffold follow-up change directories

- [x] 2.1 Create `openspec/changes/add-extension-ui-modal/` with proposal.md scoped to Phase 1 only. **Done** — `openspec new change add-extension-ui-modal` + proposal.md authored covering discovery probe, Phase 1 view types (`table | grid | form`), wire protocol, server cache on `Session` record, slash-command interception, MDI icons, Tailwind ConfirmDialog. Design/specs/tasks remain (continue with `/opsx:continue add-extension-ui-modal`).
- [x] 2.2 Create `openspec/changes/add-extension-ui-decorations/` with proposal.md scoped to Phase 2 (footer-segment, agent-metric, breadcrumb, gate, toast). **Done** — covers single-union `ext_ui_decorator` message, `Session.uiDecorators` cache, namespace collision warning, removal semantics, five client slot components.
- [x] 2.3 Create `openspec/changes/add-extension-ui-rjsf-form/` (or defer until Phase 1 + 2 ship) for Phase 4. **Done** — covers RJSF dependency choice, lazy bundle import, Tailwind theme, validation semantics, pure-pi fallback strategies (`ctx-ui` / `defaults` / `reject`). Marked OPTIONAL with explicit Phase 1 + Phase 2 dependency.
- [ ] 2.4 Coordinate with pi-flows repo on naming for the Phase 3 adoption change there. **Pending external coordination** — needs PR/issue in pi-flows repo.

## 3. Cross-reference and documentation

- [x] 3.1 Add a stub `openspec/specs/extension-ui-system/spec.md` placeholder for the eventual archive target so future changes can find the capability. **Done** — stub at `openspec/specs/extension-ui-system/spec.md` with Purpose, TBD Requirements section, and Related Capabilities cross-references.
- [x] 3.2 Add a paragraph to `docs/architecture.md` describing the new capability and its relationship to `interactive-ui-dialogs`, `ui-proxy`, and `extension-ui-forwarding`. **Done** — new "Extension UI System (planned, design-only)" section between Flow Dashboard and Bootstrap & First Run, covering mechanism, slot taxonomy, replay model, capability relationships, and no-dashboard fallback.
- [ ] 3.3 Update `AGENTS.md` "Key Files" once Phase 1 lands (deferred to Phase 1 implementation change, not this design). **Explicitly deferred** — not actionable in this change.

## 4. Reference-material verification

- [x] 4.1 Re-read PR #15 commits `55bbba8`, `4f3b4f4`, `fcf9fae`, `d623eb3` against this design and document any concrete code patterns worth lifting verbatim (without merging the branch). Capture the result in `design.md` §"Lessons from PR #15" if any new lessons emerge. **Done** — two new lessons added: (1) cache state on `Session` record (`uiModules`, `uiDataMap`) is idiomatic and gives automatic cleanup; (2) replay site = `handleSubscribe` in `subscription-handler.ts` matches existing `replayPendingUiRequests` pattern. Phase 1 implementation should keep PR #15's exact field names. design.md Decision §5 updated.
- [x] 4.2 Read `packages/extension/src/prompt-bus.ts` and confirm the new system does not duplicate functionality already covered by PromptBus. **Done** — PromptBus is request/response with first-response-wins for one-shot dialogs; new system is push-based persistent descriptors. Different shapes, no overlap. Already called out in design.md §"Non-Goals" and §"Out-of-Scope Explicitly".
- [x] 4.3 Read `packages/server/src/event-wiring.ts` to confirm the replay-cache pattern fits the existing event-replay infrastructure. **Done** — the existing `replayPendingUiRequests(ws, sessionId)` hook in `handleSubscribe` is the exact integration point. Implementation reference now recorded in design.md Decision §5.
