## Context

The dashboard ships a real Node.js runtime inside the Electron app at `<resourcesPath>/node/`. Forge config (`packages/electron/forge.config.ts:12`) adds it as an `extraResource`; the helper `pickNodeForServer` (`packages/electron/src/lib/pick-node.ts`) picks the bundled Node for spawning the server. That helper exists precisely because `process.execPath` under Electron is the Electron binary, not Node — so any code that needs a real Node child process has to look up the bundled one.

The tool registry was added later (`2026-04-19-consolidate-tool-resolution`) and grew through several extensions (`embed-managed-node-runtime`, `register-build-time-tools`, `eliminate-electron-runtime-install`). None of them taught the registry about `process.resourcesPath`. The `managedRuntimeStrategy` introduced by `embed-managed-node-runtime` looks at `<homedir>/.pi-dashboard/node/` — a directory the later `eliminate-electron-runtime-install` change deleted entirely from the runtime install pyramid. So the only registry slot that knew about a bundled Node was repurposed away and never replaced.

Result: every fresh Electron install shows `node: not found` in Settings → Tools. The bug has been present since `eliminate-electron-runtime-install` landed; nobody noticed because the bundled-node-for-server-spawn path uses a different code route (`pickNodeForServer`, not the registry).

## Goals

- `registry.resolve("node")` returns the bundled Node under Electron.
- Same for `npm` and `npx`.
- Settings → Tools shows a `"bundled"` source badge for these three rows.
- Non-Electron CLI installs are completely unaffected (no chain reordering, no new misses).
- Existing override semantics preserved (user-pinned override still wins).

## Non-Goals

- Migrating `pickNodeForServer` to call `registry.resolve("node")`. The helper has additional concerns (early bootstrap, no jiti yet, corrupted-install signaling) that make a registry-based rewrite a separate, larger change.
- Touching `~/.pi-dashboard/`. That dir is being deprecated by `fix-doctor-stale-managed-install-check`; the existing `managedRuntime` and `managedBin` slots stay in the chain unchanged. They will never hit on a clean Electron install, which is fine — they fall through cleanly.
- Adding install hints to `bundled`-sourced rows. By definition the tool is present; no install action needed. Existing Settings → Tools UI hides the `[Install ▾]` dropdown when `ok === true`.

## Decision: new strategy vs. extending `managedRuntimeStrategy`

Considered options:

**Option A (chosen)**: new `bundledNodeStrategy` strategy.

- Pro: clean classification — `Source = "bundled"` is semantically distinct from `"managed"` (`~/.pi-dashboard/`).
- Pro: independent kill switch — disabling Electron-bundled lookup (e.g. for tests) does not affect the managed slot.
- Pro: simpler test surface — each strategy has one input (its root dir) and one filesystem layout.

**Option B (rejected)**: extend `managedRuntimeStrategy` to also probe `process.resourcesPath`.

- Con: conflates two different roots under one strategy name; `source: "managed"` would now mean "Electron-bundled OR ~/.pi-dashboard". Ambiguous in the UI.
- Con: harder to disable independently.
- Con: tests now need 2× the layouts crossed with whether `resourcesPath` is set.

A is the cleaner factoring. The strategy name `bundled-node` is specific because the bundling pattern is Node-specific — we do not bundle `git`, `jj`, etc. (per the prior `register-bash-and-tool-install-help` discussion).

## Decision: insertion order in the chain

Resulting chain for `node`:

```
override → bundled → managedRuntime → managedBin → where
```

Rationale for `bundled` before `managedRuntime`:

- The Electron-bundled Node is the dashboard's own runtime — installing the Electron app implicitly opts the user into its bundled Node.
- `~/.pi-dashboard/node/` was meant to be the persistent managed install for non-Electron installs (CLI from npm). On an Electron install, `~/.pi-dashboard/` is empty post `eliminate-electron-runtime-install` — bundled comes first and wins.
- A user who wants a different Node (newer LTS, custom build) sets an `override`. That still wins over bundled (override is always first).

Rationale for keeping `managedRuntime` in the chain at all (instead of deleting):

- The slot still serves the standalone-CLI use case where a managed Node IS installed under `~/.pi-dashboard/node/`. That use case is not Electron-driven and remains supported.
- Removing it would be a scope creep — separate cleanup once `~/.pi-dashboard/` is fully deprecated.

## Decision: probe shape

Bundled-Node layout matches the upstream Node.js release tarball verbatim:

```
Unix:
  <resourcesPath>/node/bin/node
  <resourcesPath>/node/bin/npm
  <resourcesPath>/node/bin/npx
  <resourcesPath>/node/lib/...

Windows:
  <resourcesPath>/node/node.exe
  <resourcesPath>/node/npm.cmd
  <resourcesPath>/node/npx.cmd
  <resourcesPath>/node/...
```

The strategy mirrors `managedRuntimeStrategy`'s platform-conditional file-name logic verbatim. No invention; copy the helper from `managedRuntimeStrategy` and re-root it.

## Decision: injecting `resourcesPath` via `StrategyCtx.env`

The existing pattern for testable filesystem roots is `env.homedir`. Adding `env.resourcesPath` follows that pattern exactly:

```ts
// production
new ToolRegistry()  // ctx.env.resourcesPath = process.resourcesPath

// test
new ToolRegistry({
  env: { resourcesPath: "/fake/Resources" },
  // ... other test deps
});
```

Considered: reading `process.resourcesPath` directly inside the strategy without going through ctx. Rejected — couples the strategy to a Node global and breaks the existing test pattern.

## Decision: Source classification value

Picked `"bundled"`. Alternatives considered:

- `"electron-bundled"` — too specific. The strategy could in principle apply to other bundling layouts (Tauri, Pake, etc.). `"bundled"` reads cleanly across them.
- `"resource"` — too generic; doesn't convey "comes with the application".
- `"electron"` — would mislead. `gh` could be bundled-and-not-Electron-specific.

`"bundled"` is the cleanest one-word label.

## Risks / open questions

1. **`process.resourcesPath` semantics in dev mode.** In `electron-forge start`, `resourcesPath` points at the source tree, not a packaged Resources/ dir. The `node/` subdir won't exist there. The strategy fast-fails on that miss, falls through to `where` (system Node), and resolution succeeds via PATH. Acceptable: dev-mode developers have Node installed.

2. **AppImage's unpacking on Linux.** AppImage extracts to a temp dir at launch; `process.resourcesPath` points into that temp dir. The bundled Node will live there too — the strategy works without modification. Verified by inspecting `packages/electron/scripts/docker-make.sh` (Linux AppImage build copies `node/` into resources/, gets unpacked transparently).

3. **macOS code signing and bundled-Node hardened runtime.** The bundled Node binary is signed as part of the app bundle. No new signing concern from this change. But if a user manually edits Resources/node/ (replaces the binary), Gatekeeper may invalidate the bundle. Out of scope — same risk exists today.

4. **Override resolution under Electron.** Today's override file points at an absolute path; if the user pinned `/usr/local/bin/node` on a machine that no longer has it, the override strategy fails and falls through to bundled. Behavior unchanged from today; documented in `design.md` of `consolidate-tool-resolution`.

5. **Caching invalidation.** The `Resolution` cache survives the process lifetime; `process.resourcesPath` is process-global and cannot change. No cache-invalidation bug introduced.

## Rollout

1. Land this proposal.
2. Manual smoke matrix (`tasks.md:7.4`) across macOS / Windows / Linux packaged apps.
3. After smoke passes, the companion proposal `register-bash-and-tool-install-help` can rebase to remove its caveat about `npx` showing as "not found".
4. Optional follow-on: migrate `pickNodeForServer` to consume `registry.resolve("node")` once the registry's bootstrap timing is compatible with Electron's main-process startup (the registry currently relies on jiti for TS loading, which is not ready in the very-early main process).
