# Tasks

## 1. Tool registry — `bash` + `npx` registration and `installHints` data model

- [ ] 1.1 Extend `ToolDefinition` in `packages/shared/src/tool-registry/types.ts` with optional `installHints?: InstallHints`; declare `InstallHints` and `PlatformInstallHint` interfaces per the proposal.
- [ ] 1.2 Add `registry.register(binaryDef("bash", deps))` to `registerDefaultTools` in `packages/shared/src/tool-registry/definitions.ts`. No platform gate. Stock strategy chain.
- [ ] 1.3 Add `registry.register(binaryDef("npx", deps))` adjacent to the `node` / `npm` block in `definitions.ts`. No platform gate. Stock strategy chain. Add a code comment noting that the Electron-bundled `npx` is found only after `fix-node-resolution-under-electron` lands a `bundledNodeStrategy`.
- [ ] 1.4 Attach `installHints` payloads to `bash`, `npx`, `jj`, `gh`, `zrok`, `git`, `node` registrations in `definitions.ts`. The `npx` hints SHALL be a copy of the `node` hints (same install path — user installs Node, gets `npx` for free) and SHALL set `docsAnchor: "install-node"` to share the FAQ section. Source per-OS commands from vendor docs; record canonical URLs.
- [ ] 1.5 Update `registry.list()` so the snapshot it returns carries per-tool `installHints` opaquely (no transformation, no validation at resolve-time).

## 2. Tests — registry + install hints

- [ ] 2.1 Add `packages/shared/src/tool-registry/__tests__/install-hints.test.ts`:
  - Every binary tool in `{bash, npx, jj, gh, zrok, git, node}` MUST ship `installHints` for `darwin`, `win32`, and `linux`.
  - Every populated platform hint MUST have at least one of `commands`, `manual`, or `url`.
  - Every `docsAnchor` MUST correspond to an `<h2>`/`<h3>` anchor present in `docs/faq.md`.
  - `npx` and `node` MAY share the same `docsAnchor` (`install-node`).
- [ ] 2.2 Extend `packages/shared/src/tool-registry/__tests__/definitions.test.ts` (or equivalent) to assert `bash` AND `npx` are registered, resolve via the override → managed → where chain, and are platform-agnostic.
- [ ] 2.3 Add a test that resolution semantics are unchanged for the other binary tools after the `installHints` field is added (regression guard).

## 3. Bridge extension — `!`/`!!` escape migration

- [ ] 3.1 Replace `pi.exec("sh", ["-c", command], …)` at `packages/extension/src/command-handler.ts:605` with a `registry.resolve("bash")` call.
- [ ] 3.2 On `Resolution.ok === false`, emit a structured `MissingToolError` chat payload (`{ kind: "missing-tool", toolName: "bash" }`) instead of attempting the spawn. Define the payload type in `packages/shared/src/` if a suitable type does not already exist.
- [ ] 3.3 On `Resolution.ok === true`, spawn `r.path` directly (no shell, no PATH dependency).
- [ ] 3.4 Add a `command-handler.test.ts` case: when `registry.resolve("bash")` returns `{ ok: false }`, the handler emits exactly one `MissingToolError` event and never invokes `pi.exec`.
- [ ] 3.5 Add a `command-handler.test.ts` case: on the happy path the handler invokes `pi.exec(r.path, ["-c", cmd], …)` with the resolved absolute path.
- [ ] 3.6 Confirm `packages/server/src/process-manager.ts:475` is NOT modified (`/bin/sh` is the correct POSIX contract there; documented in the test as an explicit non-target).

## 4. Server — REST surface

- [ ] 4.1 Extend the `/api/tools` response in `packages/server/src/routes/tool-routes.ts` to include each tool's `installHints` from its `ToolDefinition`.
- [ ] 4.2 Update or add a route test asserting the response shape includes `installHints` for tools that declare it and omits the field for tools that do not.

## 5. Client — Settings → Tools UI

- [ ] 5.1 Update `packages/client/src/lib/tools-api.ts` types to include the optional `installHints` field.
- [ ] 5.2 Implement the `[Install ▾]` dropdown in `packages/client/src/components/ToolsSection.tsx`. Render only when `tool.ok === false` AND `tool.installHints?.[currentOs]` exists.
- [ ] 5.3 Filter dropdown items by the current OS (server-provided hint via `/api/health` or client-side `navigator.userAgentData.platform`). Document the source in code comments.
- [ ] 5.4 Each command row has a copy-to-clipboard button (use the existing clipboard helper if one exists; otherwise inline `navigator.clipboard.writeText`).
- [ ] 5.5 Add `packages/client/src/components/__tests__/ToolsSection.install-dropdown.test.tsx` covering: dropdown visibility (missing vs found), per-OS filtering, copy-to-clipboard call, docs link rendering.

## 6. Client — inline chat error component

- [ ] 6.1 Create `packages/client/src/components/chat/MissingToolInlineError.tsx`. Props: `{ toolName: string }`. Renders a one-line error with `[Install <toolName> →]` action.
- [ ] 6.2 The action navigates to Settings → Tools and scrolls the matching row into view (use existing routing helpers + `document.getElementById(`tool-row-${toolName}`)?.scrollIntoView({ block: "center" })`).
- [ ] 6.3 Wire the chat-renderer dispatch (existing chat event → component mapping) to route `MissingToolError` payloads to the new component.
- [ ] 6.4 Add a render test for `MissingToolInlineError` covering link click + scroll-into-view trigger.

## 7. Docs

- [ ] 7.1 Add anchored install-guidance sections to `docs/faq.md`: `## Install bash`, `## Install jj`, `## Install gh`, `## Install zrok`, `## Install git`, `## Install node`. Each section: per-OS commands (matching the registry hints), vendor docs link, "why the dashboard needs it" paragraph.
- [ ] 7.2 Confirm anchors match the `docsAnchor` values in `definitions.ts` (lint test 2.1 enforces this).
- [ ] 7.3 Update `AGENTS.md` "Key Files" section ONLY if any new file exceeds 200-char architectural-backbone status. Per-file detail goes in `docs/file-index-shared.md` / `file-index-client.md` per the Documentation Update Protocol; delegate the file-index edits to a subagent in caveman style.

## 8. Spec delta + final verification

- [ ] 8.1 Author `openspec/changes/register-bash-and-tool-install-help/specs/tool-registry/spec.md` with ADDED + MODIFIED requirements per the proposal.
- [ ] 8.2 Run `openspec validate register-bash-and-tool-install-help --strict` (or equivalent) and resolve any schema errors.
- [ ] 8.3 Run `npm test 2>&1 | tee /tmp/pi-test.log` and confirm no regressions; grep `FAIL` per the project's testing protocol.
- [ ] 8.4 Run `npm run build` to confirm client compilation succeeds with the new component + types.
- [ ] 8.5 Manual smoke test:
  - macOS / Linux: `!ls` in dashboard chat resolves bash via `where`, runs cleanly.
  - Windows (clean, no Git-for-Windows): `!ls` shows `MissingToolInlineError` with deep-link; Settings → Tools shows `bash` row with `[Install ▾]` populated.
  - Windows (with Git-for-Windows): `!ls` resolves bash via `where` to `C:\Program Files\Git\bin\bash.exe`.
