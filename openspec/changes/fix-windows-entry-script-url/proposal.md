## Why

On Windows, when the dashboard source lives on a drive letter outside the common `C:`/`D:` set (e.g. `B:\Dev\...`), `pi-dashboard start`, the bridge extension's server launcher, the Electron server-lifecycle launcher, and `POST /api/restart` all crash with `ERR_UNSUPPORTED_ESM_URL_SCHEME: Received protocol 'b:'`. The prior change `fix-windows-server-parity` (2026-04-18) hardened the **loader** argument (`--import <X>`) to always be a `file://` URL, but left the **entry script** argument (the `<Y>` in `node --import <X> <Y>`) as a raw Windows path. Node ≥ 20's ESM loader parses the entry script argument as a URL in the same way it parses `--import`; its Windows drive-letter heuristic catches `C:` and most common drives but not all, so the bug survived on user machines with source on `A:`, `B:`, and similar letters. Four separate spawn sites pass a raw `cliPath` today; the fix is a one-line URL wrap per site, backed by a shared helper and a repo-level lint test that prevents regression.

## What Changes

- Add `packages/shared/src/platform/node-spawn.ts` exporting:
  - `toFileUrl(pathOrUrl: string): string` — idempotent, pure helper that converts raw OS paths (including Windows drive-letter paths) to `file://` URLs and passes through inputs that are already `file://` URLs.
  - `spawnNodeScript(opts)` — chokepoint for spawning `node --import <loader> <entry> <args...>` where both `loader` and `entry` are URL-wrapped via `toFileUrl` before being passed to Node. Delegates actual spawning to `packages/shared/src/platform/exec.ts` `spawn`.
- Update four call sites to wrap `cliPath` (entry script) with `toFileUrl` or route through `spawnNodeScript`:
  - `packages/server/src/cli.ts` (line 344 — `cmdStart`)
  - `packages/extension/src/server-launcher.ts` (line 84 — `launchServer`)
  - `packages/electron/src/lib/server-lifecycle.ts` (line 359 — jiti branch of `launchViaNode`)
  - `packages/server/src/restart-helper.ts` (line 42 — `buildOrchestratorScript`)
- Add repo-level lint test `packages/shared/src/__tests__/no-raw-node-import.test.ts` that scans `packages/*/src/` (excluding `platform/node-spawn.ts` and `__tests__/`) for `spawn(...)` calls containing `"--import"` where the third argv slot is a bare identifier rather than a `file://` URL or a `toFileUrl(...)` call. Fails with file:line on any violation. Mirrors the existing `no-direct-child-process.test.ts` and `no-direct-process-kill.test.ts` patterns.
- Add unit tests `packages/shared/src/__tests__/node-spawn.test.ts` covering `toFileUrl` idempotence, Windows drive-letter wrapping (including the `B:\` regression case), POSIX absolute paths, and argv-construction correctness for `spawnNodeScript`.
- Extend the `dashboard-server` capability spec: the existing "TypeScript loader passed as file:// URL" requirement is generalized to cover **every position** Node's ESM loader parses as a URL — both `--import` loader and entry script. Adds a scenario for the Windows drive-letter **entry-script** regression (symmetric to the existing loader scenario).

## Capabilities

### New Capabilities
(none — this is a hardening of an existing capability)

### Modified Capabilities
- `dashboard-server`: the "TypeScript loader passed as file:// URL" requirement is broadened to **all** path positions consumed by Node's ESM loader (loader + entry). A new scenario covers entry-script Windows drive-letter crashes.

## Impact

- **Affected code**: 4 spawn sites across `packages/server/src/cli.ts`, `packages/extension/src/server-launcher.ts`, `packages/electron/src/lib/server-lifecycle.ts`, `packages/server/src/restart-helper.ts`. Each site changes 1–3 lines.
- **New files**: 1 source (`platform/node-spawn.ts`), 2 tests (`node-spawn.test.ts`, `no-raw-node-import.test.ts`).
- **Public API**: no change. `spawnNodeScript` is internal to the repo; no browser protocol or REST change.
- **Build/release**: no change.
- **Performance**: `pathToFileURL` is ~microsecond cost, called once per server spawn. Negligible.
- **Compatibility**: `toFileUrl` is a no-op-in-effect on Linux/macOS — it produces the same `file://` URL that the pre-change code implicitly relied on via Node's heuristic. Behaviour-preserving on platforms that already worked.
- **Enforcement**: the new lint test runs in CI via `npm test`; regressions fail the suite.
- **Dependencies**: none added.
