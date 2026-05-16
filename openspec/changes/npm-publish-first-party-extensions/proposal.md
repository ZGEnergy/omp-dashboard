# npm-publish-first-party-extensions

## Why

The two first-party pi extensions the dashboard depends on — `pi-anthropic-messages`
(required for Claude tool calls on any `anthropic-messages` provider) and
`pi-flows` (powers the dashboard's Flow view) — were **git-only**. Their entries
in `RECOMMENDED_EXTENSIONS` used `https://github.com/.../...git` URLs, which
forced pi's `DefaultPackageManager` to `git clone` them at install time.

Consequences on Windows (where git is not pre-installed):

- The boot-time `git-required.html` gate (see `require-git-on-boot` change)
  blocked the entire app until the user installed git via winget.
- Without git, the **required** `pi-anthropic-messages` extension could not
  install at all → Claude tool calls silently fell back to Claude Code's
  built-in `bash_ide` sandbox.
- `pi-flows` was additionally excluded from `BUNDLED_EXTENSION_IDS` because
  the upstream repo declared no SPDX license, blocking the
  bundle-recommended-extensions allowlist check (MIT/Apache-2.0/BSD-{2,3}-Clause/ISC).

This change publishes both packages to npm and refactors the manifest so
runtime install no longer needs git, while preserving the Electron
offline-bundling pipeline (which is still git-based by design — it clones
+ records `.bundled-sha`).

## What Changes

- **Published** `@blackbelt-technology/pi-anthropic-messages@0.3.2` and
  `@blackbelt-technology/pi-flows@0.2.1` to npm (both MIT-licensed,
  `publishConfig.access: public`, `repository` field set).
- **Added** optional `bundleSource?: string` field to `RecommendedExtension`
  in `packages/shared/src/recommended-extensions.ts`. Carries the git URL
  used **only** by the Electron offline-bundling pipeline. Runtime install
  uses `source` (npm).
- **Changed** both entries' `source` from `https://github.com/...git` →
  `npm:@blackbelt-technology/...`. Each declares `bundleSource` pointing
  at its GitHub git URL.
- **Re-added** `pi-flows` to `BUNDLED_EXTENSION_IDS` now that upstream
  declares MIT.
- **Updated** `packages/electron/scripts/bundle-recommended-extensions.mjs`
  to use `entry.bundleSource ?? entry.source` for cloning.
- **Updated** `packages/electron/src/lib/dependency-installer.ts`
  (`installBundledExtensions`) to use the effective git source for both
  `parseBundledGitSource` (cache path) and `manager.addSourceToSettings`.
  Skip-if-present now checks both source forms.
- **Updated** `packages/server/src/routes/recommended-routes.ts` to match
  `installed`/`activeInPi` against either `source` OR `bundleSource`, so an
  extension installed via either route shows correctly in the UI. Metadata
  fetch is npm-first with GitHub-via-`bundleSource` fallback.

## Impact

- **Affected specs:**
  - `bundled-recommended-extensions` — MODIFIED ("Non-git source rejected"
    scenario now reads against effective source); ADDED requirement for
    `bundleSource` field semantics.
- **Affected code:**
  - `packages/shared/src/recommended-extensions.ts`
  - `packages/electron/scripts/bundle-recommended-extensions.mjs`
  - `packages/electron/src/lib/dependency-installer.ts`
  - `packages/server/src/routes/recommended-routes.ts`
  - tests in `packages/shared/src/__tests__/recommended-extensions.test.ts`
- **Operational:**
  - Windows-without-git users can now install both extensions via npm.
  - Git remains useful for BranchPicker, user-pasted git sources,
    attach-proposal, and Electron build-time bundling, but is no longer a
    runtime requirement for the critical Claude tool-call path.
  - Existing users who already installed via git URL continue to work —
    `recommended-routes.ts` matches both source forms, so the UI does not
    regress to "not installed".

## Docs cleanup (commit `74df4030`)

The architecture doc previously described a boot-time "Git is required"
gate (`git-gate.ts`, `git-required.html`, `system-toolchain-installer.ts`,
`openGitRequiredWindow`, `evaluateGitGate`, escape hatches
`--skip-git-gate` / `PI_DASHBOARD_SKIP_GIT_GATE=1`, a winget/brew/xcode-select/pkexec
platform-dispatch table, a single-flight cancellation model, and a
`~/.pi-dashboard/git-gate.log`). None of that code ever shipped — the
section was aspirational documentation from a never-implemented
`require-git-on-boot` change. After publishing the two first-party
extensions to npm, the section is no longer aspirational *or* desirable.

The section is rewritten as "Git is recommended (not required)" (21 lines,
down from 106). It enumerates the four places git is still genuinely used
(`preClonePiExtensionIfGit` for git-URL sources only — no-op for npm;
`installBundledExtensions` for entries whose `bundleSource` is a git URL;
BranchPicker / session-card git status; build-time
`bundle-recommended-extensions.mjs`) and adds a historical note that the
listed gate modules never shipped, so future agents do not re-discover
them as missing dependencies.

Verified clean: no remaining references to `git-gate`, `git-required.html`,
`openGitRequiredWindow`, `evaluateGitGate`, `system-toolchain-installer`,
or `require-git-on-boot` in `docs/` or `README.md`.
