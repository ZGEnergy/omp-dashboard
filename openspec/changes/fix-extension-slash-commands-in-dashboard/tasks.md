## 1. Empirical pre-check

- [ ] 1.1 Verify open question 4 from `design.md`: type `/flows:new` (and `/flows:edit`, `/flows:delete`) in dashboard chat and confirm whether they currently fall through to `sendUserMessage` (broken) or hit the bridge's flow fast-path (working). Capture the answer in a short note pinned to the change folder so the routing-order spec accurately reflects which step catches each.

## 2. Pure helper + types

- [ ] 2.1 Add `isExtensionSlashCommand(text, commandList)` to `packages/extension/src/bridge-context.ts` next to the existing `filterHiddenCommands` (it already owns the `DASHBOARD_NATIVE_COMMANDS` set). Export it from the same module. Implementation per ADDED Requirement "Extension slash command detection" — pure predicate, no pi calls, no mutation.
- [ ] 2.2 Add unit tests covering all 8 scenarios in the ADDED Requirement (`packages/extension/src/__tests__/extension-slash-command-detection.test.ts`). Each scenario from the spec → one `it()` block. No stub pi needed — pure string + array input.

## 3. Bridge wiring (stopgap path — Path D)

- [ ] 3.1 In `packages/extension/src/bridge.ts::sessionPrompt`, immediately AFTER the existing flow fast-path block and BEFORE the template-expansion fallback, add the extension-command branch: call `pi.getCommands()`, run `isExtensionSlashCommand(text, commands)`, and if true:
  - emit `command_feedback { command: text, status: "started" }` via `connection.send` (or whatever the existing `command_feedback` emit path is — match the `/reload`, `/new`, `/model` siblings already in `command-handler.ts`)
  - feature-detect `typeof (pi as any).dispatchCommand === "function"`
  - if true: call `(pi as any).dispatchCommand(text, { streamingBehavior: "followUp" })`, then on resolve emit `command_feedback { command: text, status: "completed" }`
  - if false: emit `command_feedback { command: text, status: "error", message: <reason citing pi 0.71+ requirement> }` and `return` without invoking the fallback
- [ ] 3.2 Apply the SAME change to `packages/extension/src/command-handler.ts`'s slash branch's ELSE arm (line ~263, where `options?.sessionPrompt` is undefined and the code falls through to `pi.sendUserMessage(parsed.text)`). The two code paths must stay in lockstep — both routes must apply the extension-command branch before `sendUserMessage`. Consider extracting the branch into a shared helper (`dispatchOrStopgap(pi, text, commandList, sink)`) to avoid drift; place in `bridge-context.ts` or a new `slash-dispatch.ts`.
- [ ] 3.3 Audit every other `pi.sendUserMessage(...)` call site in `command-handler.ts` (search shows 5 sites: passthrough fallback, image-bearing path, multi-line slash path) and confirm NONE of them should also gate through the extension-command branch. The intent is: only typed single-line `/slash` text gates; everything else (multi-line, image-bearing, no-slash) goes raw to the LLM as before. Add inline comments at each `sendUserMessage` site explaining why it's exempt.

## 4. Regression test pinning routing contract

- [ ] 4.1 Create `packages/extension/src/__tests__/bridge-slash-command-routing.test.ts`. Stub `pi` exposes:
  - `getCommands()` returning a small fixture (one extension cmd `ctx-stats`, one skill `skill:foo`, one prompt template `review`, one bridge-native `__dashboard_reload`)
  - `dispatchCommand` (sometimes function, sometimes undefined — toggled per test)
  - `sendUserMessage` — recorded as a call spy; failing the test if hit when it shouldn't be
  - `events.emit` — recorded for flow paths
  - other minimum surface for `createCommandHandler` to construct without throwing
- [ ] 4.2 Drive `commandHandler.handle({ type: "send_prompt", sessionId: "test", text: "<input>" })` for each row of the table in `design.md` Decision 5. Assert call counts + emitted `command_feedback` events match exactly. Cover both `dispatchCommand` available and unavailable.
- [ ] 4.3 Add an explicit anti-regression assertion: `/ctx-stats` MUST never reach `sendUserMessage` regardless of whether `dispatchCommand` is available. Comment the test with `// regression: see openspec/changes/fix-extension-slash-commands-in-dashboard/` so future refactors find it.

## 5. Type definitions + feature detection helper

- [ ] 5.1 Add an optional `dispatchCommand` field to the bridge's local `pi` API type (the `as any` cast in `bridge.ts` is OK, but tighten where reasonable). If pi 0.71 ships before this change archives, replace the cast with the upstream type.
- [ ] 5.2 Centralize the feature-detection in a one-liner helper `hasDispatchCommand(pi): boolean` in `bridge-context.ts`. Used by both call sites in tasks 3.1 and 3.2 to avoid duplicate `typeof === "function"` casts.

## 6. Documentation + AGENTS.md

- [ ] 6.1 Update `AGENTS.md` "Key Files" entries for `command-handler.ts`, `bridge.ts`, and `bridge-context.ts` with one-line summaries of the new behavior (extension-command stopgap + feature-detected dispatch). Cite this change name (`fix-extension-slash-commands-in-dashboard`) so future readers find the design doc.
- [ ] 6.2 Add a CHANGELOG entry under `## [Unreleased]` noting:
  - Extension slash commands (e.g. `/ctx-stats`, `/curator`, `/agents`) now visibly fail with a `command_feedback` error in the dashboard chat instead of silently sending to the LLM
  - Full dispatch will activate automatically once pi 0.71+ ships `pi.dispatchCommand`
  - Reference the upstream PR (file in step 8) when its URL is known

## 7. Manual verification

- [ ] 7.1 Run `npm run build && curl -X POST http://localhost:8000/api/restart && npm run reload`. In a fresh dashboard session, type `/ctx-stats` (context-mode is already installed in this dev env). Confirm:
  - On pi 0.70: chat shows the started+error `command_feedback`, the LLM is NOT prompted
  - On pi 0.71+ (when available): chat shows started+completed and `ctx.ui.notify` renders the stats card
- [ ] 7.2 Repeat for `/curator` (pi-web-access), `/agents` (pi-subagents) — same expected outcomes.
- [ ] 7.3 Repeat for `/skill:openspec-explore` to verify skill-expansion path is unaffected (still routes through template-expansion → `sendUserMessage`).
- [ ] 7.4 Repeat for `/totally-unknown-command` to verify unknown slashes still passthrough as today.
- [ ] 7.5 Confirm `/flows`, `/flows:new`, `/flows:edit`, `/flows:delete` still work (flow fast-path takes precedence regardless of extension-command branch).

## 8. Upstream follow-up (separate change, not blocking this one)

- [ ] 8.1 File a PR against `mariozechner/pi-coding-agent` adding `dispatchCommand(text, options?)` to `ExtensionAPI` (declared in `core/extensions/types.d.ts`, wired in `core/extensions/loader.js::createExtensionAPI`, bound in `core/agent-session.js::bindCore`). Implementation delegates to `session.prompt(text, { expandPromptTemplates: true, streamingBehavior: options?.streamingBehavior })`. Reference this design doc in the PR description.
- [ ] 8.2 Once upstream PR merges and pi 0.71 releases: open a follow-up dashboard change `use-pi-dispatchCommand-when-available` (already covered by feature detection — likely just removing the stopgap `error` branch once the dashboard's pinned pi minimum bumps). Confirm the existing regression test still passes.
