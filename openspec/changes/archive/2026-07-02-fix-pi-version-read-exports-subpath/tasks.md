# Tasks

## 1. Reproduce

- [x] 1.1 Confirm the throw: from repo root run a one-liner that does `createRequire(...).resolve("@earendil-works/pi-coding-agent/package.json")` and observe `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- [x] 1.2 Confirm the installed pi `exports` map omits `./package.json`: `node -e "console.log(require('@earendil-works/pi-coding-agent/package.json'))"` fails, while reading the manifest by path succeeds.

## 2. Fix code (TDD)

- [x] 2.1 Write a failing test: a fixture package dir whose `exports` omits `./package.json`; assert the version reader returns the manifest `version` and does not throw. Verify it fails against current `defaultReadPiVersion`.
- [x] 2.2 Rewrite `defaultReadPiVersion()` in `packages/extension/src/model-tracker.ts` to resolve the `"."` entry and walk up to the nearest `package.json` with matching `name` (bounded ≤10 hops, `existsSync` guard, `name` check). Return `undefined` when not found instead of throwing.
- [x] 2.3 Correct the misleading comment ("...runs inside pi's own tree, so createRequire resolution always succeeds") to state the exports-map gate is what matters.
- [x] 2.4 Make the test pass.

## 3. Verify

- [x] 3.1 `npm test` green (extension suite incl. new test).
- [x] 3.2 `npx tsc --noEmit` exit 0.
- [x] 3.3 Manual: `npm run reload`, watch a connected pi TUI for ≥1 poll interval (30 s) — confirm no `ERR_PACKAGE_PATH_NOT_EXPORTED` spam and that the session header still shows the pi version.

## 4. Spec

- [x] 4.1 `openspec validate fix-pi-version-read-exports-subpath` passes.
