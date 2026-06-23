## 1. Verify the real event shapes

- [ ] 1.1 Instrument `ctx.onEvent` (temporary log) against a live PONG run; record the `eventType` + `data` shape of (a) the injected-prompt echo and (b) the assistant reply. → verify: captured shapes documented in the PR description.

## 2. Tighten capture (TDD)

- [ ] 2.1 Add a capture unit test feeding `[injected-prompt echo, assistant reply, agent_end]`; assert `result.md` == reply text and does NOT contain the injected prompt. → verify: test fails against current code.
- [ ] 2.2 Add a unit test feeding `[injected-prompt echo, agent_end]` (no reply); assert run auto-archives (empty result). → verify: test fails or is wrong against current code.
- [ ] 2.3 Update `extractAssistantText` to (a) require explicit `role === "assistant"` / the verified assistant `eventType`, and (b) handle array-of-blocks `content` (concat `{type:"text"}` block text), not only string content. → verify: 2.1/2.2 pass.
- [ ] 2.3b Add a unit test feeding an assistant message with `content: [{type:"text",text:"PONG"}]`; assert it is captured. → verify: fails against current string-only extractor.
- [ ] 2.4 Defensively exclude any captured chunk equal to the run's injected `promptText`. → verify: 2.1 still passes if the echo ever carries an assistant-ish shape.

## 3. Regression + live

- [ ] 3.1 Run the full automation-plugin suite. → verify: all existing tests (84) + new tests green; `tsc --noEmit` clean.
- [ ] 3.2 Restart the server; create the PONG automation; confirm `result.md` == `PONG` and the prompt is absent. → verify: live `GET /api/plugins/automation/result`.
- [ ] 3.3 Clean up the test automation + run + session.

## 4. Docs

- [ ] 4.1 Annotate the `packages/automation-plugin/src/server/index.ts` row in `docs/file-index-plugins.md` (`See change: fix-automation-result-capture`) — delegate to a docs subagent per the Documentation Update Protocol (caveman style).
