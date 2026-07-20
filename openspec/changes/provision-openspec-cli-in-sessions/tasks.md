# Tasks

## 1. Pin the CLI dependency

- [ ] 1.1 Add `@fission-ai/openspec` to `packages/extension/package.json` pinned
      **exact** (`1.4.1`, the generated-skill-compatible version); run install.

## 2. Shim + PATH prepend (bridge)

- [ ] 2.1 Add a bridge-init helper (`packages/extension/src/openspec-cli-shim.ts`)
      that: resolves the bin via `require.resolve("@fission-ai/openspec/
      package.json")` → join `bin/openspec.js` (exports encapsulation blocks the
      subpath); ensures a `0700` shim dir under `~/.pi/dashboard/`; writes an
      **extensionless** `#!/bin/sh` shim `exec "<process.execPath>" "<bin.js>"
      "$@"` **atomically** (temp + rename), **re-pointed every init**. Fail soft:
      resolution/write error → log + skip, never throw.
- [ ] 2.2 Prepend the canonical (realpath) shim dir to `process.env.PATH`
      idempotently (split on `path.delimiter`, compare canonical form); wire into
      bridge init (`bridge.ts`), guarded against double-run on `/reload`.
- [ ] 2.3 Keep it non-destructive: prepend only; shim dir holds only `openspec` so
      it shadows nothing; a pre-existing global `openspec` still resolves.

## 3. Docs & specs

- [ ] 3.1 Add per-file rows for the new `openspec-cli-shim.ts` + any change-history
      to `packages/extension/src/AGENTS.md` (Documentation Update Protocol).
- [ ] 3.2 `openspec validate provision-openspec-cli-in-sessions --strict` passes.

## Tests

<!-- folded from test-plan.md; all rows automated (7/7), 0 manual-only -->

- [ ] T-E1 (test-plan #E1) L1 unit — bare `openspec` resolves in-session. Input: a
      child env whose PATH has no `openspec`. Trigger: run the provision helper, then
      spawn `sh -c "openspec --version"` with the resulting PATH. Observable: exit 0
      AND stdout contains `1.6.0`. Exemplar: `packages/extension/src/__tests__/custom-provider-apikey-roundtrip.test.ts` (env save/restore) + `child_process.spawnSync`.
- [ ] T-E2 (test-plan #E2) L1 unit — idempotent prepend. Input: `process.env.PATH`
      after one provision call. Trigger: call the helper a second time (simulated
      `/reload`). Observable: the canonical shim dir appears exactly once in PATH.
      Exemplar: `packages/extension/src/__tests__/command-handler.test.ts` (env save/restore).
- [ ] T-E3 (test-plan #E3) L1 unit — re-point on init. Input: an existing shim file
      targeting an OLD resolved bin path. Trigger: run provision with a CHANGED
      resolved bin path. Observable: shim content targets the NEW `bin/openspec.js`,
      written temp+rename (no partial file). Exemplar: `packages/extension/src/__tests__/custom-provider-apikey-roundtrip.test.ts` + `os.mkdtemp`.
- [ ] T-E4 (test-plan #E4) L1 unit — non-destructive. Input: PATH seeded with a fake
      global `openspec` dir before provision. Trigger: run provision. Observable: the
      fake global dir is still present and its relative order preserved (prepend-only).
      Exemplar: `packages/extension/src/__tests__/command-handler.test.ts`.
- [ ] T-X1 (test-plan #X1) L1 unit — fail-soft + surface. Fault: `require.resolve`
      for the pinned CLI stubbed to throw. Trigger: bridge provision at init.
      Observable: no throw; PATH unchanged; a diagnostic logged AND the
      `missingTool`-style emit invoked (spy asserts both). Exemplar: `packages/extension/src/__tests__/custom-provider-apikey-roundtrip.test.ts` (spy/mocks).
- [ ] T-X2 (test-plan #X2) L1 unit — stripped PATH (F3). Fault: child env PATH lacks
      `node`. Trigger: invoke the shim `openspec --version`. Observable: exit 0 —
      resolves node via absolute `process.execPath`, not PATH. Exemplar: `packages/extension/src/__tests__/custom-provider-apikey-roundtrip.test.ts` + `child_process.spawnSync` with a scrubbed env.
- [ ] T-C1 (test-plan #C1) L2 qa smoke (Windows) — Git Bash resolution. Input: a
      Windows session, `openspec` not on PATH, `node` not required on PATH. Trigger:
      `openspec --version` via `bash.exe -c` after provision. Observable: the
      extensionless shim resolves; exit 0; prints `1.6.0`. Exemplar: `qa/tests/10-bundled-git.ps1` (Windows bundled-binary resolution smoke).

## Validate

- [ ] V1 `npm test` green for the touched packages.
- [ ] V2 Manual on a CLI-less box: with no `openspec` on PATH, click Apply → the
      skill's bare `openspec` resolves (via the shim) and runs, with no hand-edit
      fallback.
- [ ] V3 Idempotency: `/reload` the session; `echo $PATH` shows the shim dir once.
- [ ] V4 Stripped-PATH: with `node` NOT on PATH, `openspec --version` via the shim
      still runs (absolute `process.execPath`).
