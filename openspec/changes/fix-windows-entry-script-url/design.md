## Context

The dashboard spawns its own server as a Node process in four distinct call sites:

1. `packages/server/src/cli.ts` `cmdStart` — user runs `pi-dashboard start`, detached foreground server spawn.
2. `packages/extension/src/server-launcher.ts` `launchServer` — bridge extension auto-starts the server when pi session connects.
3. `packages/electron/src/lib/server-lifecycle.ts` `launchViaNode` (jiti branch) — Electron app spawning the server on boot.
4. `packages/server/src/restart-helper.ts` `buildOrchestratorScript` — `POST /api/restart` orchestrator.

Each site builds an argv of the form:

```
node  --import <loader>  <entry-script>  <args...>
```

where `<loader>` is typically a jiti or tsx register hook `.mjs` file and `<entry-script>` is `packages/server/src/cli.ts`.

Node ≥ 20's ESM loader parses **both** `<loader>` and `<entry-script>` as URLs. A raw Windows path like `B:\Dev\foo\cli.ts` URL-parses to scheme `b:`, path `\Dev\foo\cli.ts`. The ESM loader only registers handlers for `file:`, `data:`, and `node:` schemes, so it throws `ERR_UNSUPPORTED_ESM_URL_SCHEME: Received protocol 'b:'` before any filesystem access.

Node has an internal heuristic that auto-wraps **some** Windows path shapes with `file://` before the URL parse in the entry-script position. The heuristic catches the common cases (`C:\`, `D:\`) but has gaps; `A:` and `B:` (less-tested drive letters historically associated with floppy drives) fall through the heuristic and hit the strict URL parser.

The prior change `fix-windows-server-parity` (archived 2026-04-18) fixed the `--import <loader>` position at all four call sites by wrapping the loader path with `url.pathToFileURL(p).href`. The spec it wrote is explicit that "the loader" must be a `file://` URL but is silent on the entry-script position, reflecting the author's test matrix (C: drive) where the entry-script heuristic happened to succeed. User report on 2026-04-23 ran the dashboard from `B:\Dev\BB\pi-agent-dashboard-origin-develop\` and hit `ERR_UNSUPPORTED_ESM_URL_SCHEME` pointing at the entry-script argument.

Constraints:
- Zero behavioural change on Linux, macOS, and C:-drive Windows — those platforms already worked because their path shapes survive the heuristic.
- The fix must also survive any future Node version that tightens the entry-script heuristic further (the long-term trend is toward stricter URL-only handling).
- The repo has an established pattern of "chokepoint + lint test" enforcement (`platform/exec.ts` + `no-direct-child-process.test.ts`; `platform/process.ts` + `no-direct-process-kill.test.ts`). Any new guard rail should follow this pattern to be recognizable to future maintainers.
- No new runtime dependencies. `pathToFileURL` is in Node core.

## Goals / Non-Goals

**Goals:**
- `pi-dashboard start`, bridge auto-start, Electron server spawn, and `POST /api/restart` all succeed on Windows regardless of which drive letter the source lives on.
- A single small helper (`toFileUrl` / `spawnNodeScript`) is the repo's canonical way to build argv for `node --import <X> <Y>` spawns, mirroring the `exec.ts` / `platform/process.ts` chokepoint pattern.
- A repo-level lint test prevents future spawn sites from passing raw paths to `node --import`, catching regressions at CI time with a clear file:line error.
- The fix-windows-server-parity spec is extended — not replaced — so the historical record and behavioural guarantee are additive.

**Non-Goals:**
- Fixing the underlying Node.js bug. That is an upstream concern; this repo ships defensive wrapping until Node normalizes entry-script path handling.
- Changing any other Windows integration surface (process termination, pty spawning, terminal emulation, etc.). Those surfaces have their own established chokepoints and are out of scope.
- Introducing a full "spawn any Node process" abstraction. `spawnNodeScript` handles only the `node --import <loader> <entry>` shape because that's the one position that triggers this bug. Other Node spawns (e.g. `node -e <code>` from `restart-helper`) don't take an entry-script path argument in the affected position and don't need this wrapper.
- Registering the CLI entry script with `ToolRegistry`. `ToolRegistry` is for finding **external** tools; the CLI entry is resolved from `import.meta.url` at the call site. Routing it through the registry would be a category mismatch.

## Decisions

### Decision 1: New helper module `platform/node-spawn.ts` rather than extending `platform/exec.ts`

`platform/exec.ts` is the sole allowed importer of `node:child_process` — enforced by `no-direct-child-process.test.ts`. Extending it to know about `--import` / file:// URL wrapping would overload its role from "thin child_process wrapper" to "Node-argv-aware spawner", making its invariant harder to reason about. A sibling module `platform/node-spawn.ts` that **uses** `platform/exec.ts`'s `spawn` keeps each file's concern minimal and keeps the lint tests independent.

**Alternatives considered:**
- *Inline `pathToFileURL()` at each of the four call sites without a helper.* Works but drifts over time — the fifth site will forget. Rejected because the whole point is universal enforcement.
- *Wrap `platform/exec.ts::spawn` with auto-URL-conversion when `cmd === process.execPath && argv[0] === "--import"`.* Action-at-a-distance. Rejected because the conversion would be invisible to readers; debugging "why is my argv different from what I passed" is painful.

### Decision 2: `toFileUrl` handles Windows-style input regardless of host OS

The helper detects Windows-style input (drive letter + backslash) via `/^[A-Za-z]:[\\/]/` and builds the `file:///X:/...` URL manually rather than delegating to `pathToFileURL`, because `pathToFileURL` on a POSIX host URL-encodes backslashes rather than treating them as separators. This mirrors the pattern already in `packages/shared/src/resolve-jiti.ts::buildJitiRegisterUrl` — the existing precedent for "handle Windows paths on POSIX test hosts" in this codebase.

**Alternative considered:**
- *Only call `pathToFileURL` and rely on host-OS awareness.* Would work in production but prevent unit tests on Linux/macOS from exercising the Windows regression case. Rejected because the `B:\` regression test must run on CI (Linux).

### Decision 3: `spawnNodeScript` is the preferred migration shape; raw `toFileUrl` is the minimum

Two of the four sites (`cli.ts`, `server-launcher.ts`) build a clean standalone argv and benefit from the higher-level `spawnNodeScript` wrapper. Two sites (`server-lifecycle.ts`, `restart-helper.ts`) build argv as part of a larger construction (string template, conditional branches) where inlining `toFileUrl(cliPath)` is cleaner than restructuring the call. Both forms are acceptable; the lint test accepts either.

### Decision 4: The lint test is regex-based, matching existing patterns

The existing `no-direct-child-process.test.ts` and `no-direct-process-kill.test.ts` both use string/regex scans of source files rather than AST parsing. This is simpler, fast enough, and consistent with the repo idiom. False positives in the lint are acceptable in exchange for simplicity — the regex can be tuned conservatively, and the allowlist (`platform/node-spawn.ts`, `__tests__/`) handles intentional call sites.

### Decision 5: Extend the existing `dashboard-server` spec, do not create a new capability

The behavioural guarantee "`pi-dashboard` starts on Windows without URL-scheme errors" already lives in `dashboard-server` spec via `fix-windows-server-parity`. Creating a new capability for "entry-script URL handling" would fragment the semantic model. The existing requirement is broadened from "the loader" to "every position Node parses as a URL" and a new scenario covers the drive-letter entry-script regression.

## Risks / Trade-offs

- **[Risk] The regex lint produces false positives on complex argv constructions.** → Mitigation: the pattern is narrow — it fires only on `"--import"` followed by a non-URL, non-`toFileUrl(...)` third argv slot. Allowlist covers `platform/node-spawn.ts` itself and `__tests__/`. If a false positive lands, the fix is one more allowlist entry, not a spec revision.
- **[Risk] A future Node version hardens the `--import` loader heuristic further such that even `file:///X:/...` is rejected on some drive letters.** → Mitigation: the spec's scenario is worded as a behavioural guarantee (no `ERR_UNSUPPORTED_ESM_URL_SCHEME` on non-`C:` drives), so a regression would surface via the regression test running in CI. Follow-up fixes would update `toFileUrl` in place; call sites would not change.
- **[Trade-off] The helper's name is `spawnNodeScript`, not `nodeImport` or `spawnWithLoader`.** The naming prioritizes the common case ("spawn a node script with an optional loader") over listing the flags. If future Node flags (e.g. `--conditions`, `--experimental-*`) become load-affecting, the helper signature can grow without breaking existing callers.
- **[Risk] `restart-helper.ts` embeds argv via `JSON.stringify` inside a `node -e` script.** → Mitigation: `toFileUrl` runs before `JSON.stringify`, so the embedded argv contains the already-URL-wrapped entry. No escape-handling gymnastics needed.
- **[Trade-off] The lint test checks source files, not compiled output.** A sufficiently determined contributor could bypass it by constructing the argv string dynamically. This is accepted — the goal is "catch the common regression", not "prove no violation". Symmetric to `no-direct-child-process.test.ts`.

## Migration Plan

No migration — this is a defensive fix with behavioural parity on every previously-working path. Deploy by:

1. Land the helper + tests.
2. Migrate the four call sites to `toFileUrl(cliPath)` or `spawnNodeScript`.
3. Run the full test suite. The new regression test should pass; existing tests should pass unchanged.
4. Verify on a Windows machine with source on `B:\` that `pi-dashboard start` succeeds (and smoke-test on `C:\` to confirm no regression).
5. Release in the next tagged version. No feature flag, no phased rollout.

Rollback: revert the four call-site edits; the helper and tests can stay as dead code without impact. The bug would re-surface on non-`C:` drives.

## Open Questions

- Should `spawnNodeScript` also set `windowsHide: true` by default (matching `platform/exec.ts`)? Current draft defers to `spawnOptions` so callers can opt out. Decision: leave to the caller for now; all current callers already pass full `spawnOptions`.
- Should the lint test also fire on `spawn(process.execPath, ["--loader", X, Y, ...])` even though no current call site uses `--loader`? Decision: yes — future-proof the guard. Implementation adds both `--import` and `--loader` to the regex.
