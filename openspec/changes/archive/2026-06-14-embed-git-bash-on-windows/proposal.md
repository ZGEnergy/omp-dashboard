# Embed Git & Bash on Windows (via dugite-native)

## Why

On Windows the pi agent cannot operate without two host-supplied tools:

- **git.exe** — every flow that reads/writes the repo (status, diff, log,
  branch listing, checkout, stash) shells out to `git`.
- **a POSIX shell** — pi's `!` and `!!` prompt prefixes run via
  `pi.exec("sh", ["-c", cmd])` (verified in `command-handler.ts`), so the
  agent needs an `sh` on PATH; without it, half the interaction model is
  dead. NOTE (R1 spike): dugite-native ships **no `bash.exe`** — the
  shell is `usr/bin/sh.exe` (GNU bash 5.2.37 under the name `sh`). Since
  pi calls `sh`, this matches exactly.

Today we silently assume both are on `PATH`. On a fresh Windows laptop
without **Git for Windows** installed:

- `git status`, branch picker, dirty-state probes all fail with ENOENT
- `!ls`, `!!rg foo`, any user "bang-prefix" prompt errors out
- The dashboard *launches* fine (we bundle Node + node-pty), so the
  failure mode is silent: red rows in Tools, empty branch lists,
  unhelpful "command not found" in chat.

macOS and Linux ship git out of the box and have a system `/bin/bash`, so
this is a Windows-only problem. We want a Windows-only fix that does not
regress mac/linux behaviour and does not bloat their installers.

## What changes

1. **Build-time bundle (Windows targets only).** A new
   `packages/electron/scripts/download-git-windows.mjs` runs during
   Windows electron builds (both `win32/x64` and `win32/arm64` matrix
   legs). It fetches the matching `dugite-native` GitHub Release tarball,
   verifies SHA-256 against a pinned `_git-version.json`, extracts to
   `packages/electron/resources/git/`, and writes a
   `THIRD-PARTY-LICENSE.txt`. Mac/Linux builds skip the step entirely.

2. **GO/NO-GO guard in `bundle-server.mjs`.** When the target is win32,
   assert `resources/git/cmd/git.exe`, `resources/git/usr/bin/sh.exe`,
   and `resources/git/THIRD-PARTY-LICENSE.txt` exist. Fail the build
   loudly if missing (mirrors the existing node-pty prebuilds guard).

3. **Runtime selection setting.** A new top-level config key
   `windowsGitSource` (default `"auto"`) on
   `~/.pi/dashboard/config.json`, tri-state `"auto" | "host" | "bundled"`:

   | Setting     | Host has git+bash? | Active git/bash     |
   |-------------|---------------------|---------------------|
   | `"auto"`    | yes                 | host (PATH unchanged) |
   | `"auto"`    | no                  | bundled (prepended) |
   | `"host"`    | yes                 | host                |
   | `"host"`    | no                  | **Doctor error**    |
   | `"bundled"` | either              | bundled             |

   `auto` is the default. It probes once at server startup (cached for
   the life of the process), re-probed on `/api/restart` or
   Doctor's *Re-check*. On non-Windows hosts the setting is a no-op.

4. **PATH augmentation helper.** A new
   `ensureBundledGitOnPath(env, opts)` sibling to
   `ensureWindowsSystemPath`. It hooks into the single spawn-env
   chokepoint `ToolResolver.buildSpawnEnv`
   (`packages/shared/src/platform/binary-lookup.ts`), running **after**
   the existing `ensureWindowsSystemPath` call at the end of that method.
   That one hook covers both the server-launcher startup env and every
   `process-manager.ts` bridge/headless spawn (both flow through
   `buildSpawnEnv`). The PTY path is separate: `terminal-manager.ts`
   builds its env as `{ ...process.env, ...getTerminalEnvHints() }` and
   does **not** go through `buildSpawnEnv`, so it gets its own
   `ensureBundledGitOnPath` call (or `getTerminalEnvHints` in
   `packages/shared/src/platform/shell.ts` is extended) — otherwise
   `!`/`!!` bang-prefix commands running in the terminal would miss
   bundled git/bash. When active, it prepends:
   - `resources/git/cmd` (git.exe)
   - `resources/git/usr/bin` (sh + coreutils: grep, sed, find, awk,
     tar, etc.)
   - `resources/git/<libdir>/bin` (DLLs)

   …and sets:
   - `GIT_EXEC_PATH=resources/git/<libdir>/libexec/git-core`
   - `SSL_CERT_FILE=resources/git/ssl/certs/ca-bundle.crt`

   **`<libdir>` is arch-specific (R1 spike).** win32-x64 → `mingw64`;
   win32-arm64 → `clangarm64`. `resolveBundledGitDir()` detects which of
   `mingw64/`/`clangarm64/` exists; never hardcode `mingw64`.

5. **Settings UI.** New Windows-only section in `SettingsPanel.tsx`
   exposing the radio (`auto` / `host` / `bundled`) with a live readout
   of which source is currently active ("Currently active: host —
   `C:\Program Files\Git\cmd\git.exe`"). Hidden on mac/linux.

6. **Diagnostics surface.** `runSharedChecks` in
   `packages/shared/src/doctor-core.ts` gains two rows: `git source` and
   `bash source`, each showing path + version + `(host)` or `(bundled)`.

7. **License compliance.** Git is GPL v2. We ship `THIRD-PARTY-LICENSE.txt`
   bundled inside `resources/git/` with verbatim Git COPYING, the
   MSYS2/MinGW transitive notices, and a pointer to
   `https://github.com/desktop/dugite-native` as the corresponding-source
   location. About dialog and Diagnostics link to the file.

## Decisions

### D1. Reuse `dugite-native` upstream tarballs as-is

`desktop/dugite-native` is GitHub Desktop's production-tested,
size-optimised MinGW64 Git build (no Perl, no Tcl/Tk, no system-library
linkage, symlink-deduped). Used by GitHub Desktop, GitKraken, and
~20k weekly npm `dugite` consumers. It ships `git` + `bash` + minimal
coreutils + Git LFS + Git Credential Manager + a CA bundle in one
tarball, with side-by-side `windows-x64` and `windows-arm64` releases.

We **consume the tarball**, not the `dugite` npm package — we don't need
its Node bindings (we shell out via the bridge anyway). This means no
runtime `node_modules` footprint and no postinstall script during user
`npm install`; the download runs only in our CI bundling step.

Rejected alternatives:
- *Custom MinGit + busybox-w32 stack* — ~50 MB smaller but doubles
  maintenance surface, no provenance.
- *Forking dugite-native to trim Git LFS / GCM* — saves ~30 MB but adds
  ongoing rebase cost; defer until size becomes a documented complaint.
- *Lazy download on first run* — pushes a 50 MB network fetch to every
  fresh-install user, complicates offline scenarios. Build-time bundle
  is the contract the user already implicitly buys into when downloading
  a 232 MB installer.

### D2. Default `windowsGitSource: "auto"`, prefer host

Power users who installed Git for Windows themselves expect their
version, their `~/.gitconfig`, their credential manager, their PATH to
win. The bundled git exists for the fresh-laptop case. Atomicity rule:
`auto` requires **both** `git` **and** a POSIX shell (`bash`/`sh`) on
host PATH before using host; otherwise we use bundled (both, atomically)
to avoid the Frankenstein "git from winget, shell from us" case. (Host
Git for Windows ships `bash.exe`; the bundle ships `sh.exe`.)

Rejected alternatives:
- *Always prefer bundled* (dugite's own model) — deterministic, but
  breaks power-user expectation that their installed git wins. Available
  via `windowsGitSource: "bundled"` for users who want it.

### D3. Ship both `win32-x64` and `win32-arm64`

The CI matrix in `.github/workflows/_electron-build.yml` already
includes both Windows architectures. `download-git-windows.mjs` reads
the target arch (via `process.env.npm_config_target_arch`, already
threaded by `bundle-server.mjs`) and fetches the matching tarball.

**Asset-naming caveat (verified against `v2.53.0-3`).** The release
tag and the asset filename infix differ: the tag is the URL path segment
(`v2.53.0-3`) but the filename embeds a git short-SHA
(`dugite-native-v2.53.0-f49d009-windows-x64.tar.gz`). The download URL is
`…/releases/download/<tag>/dugite-native-<assetInfix>-windows-<arch>.tar.gz`.
A single-`<tag>` template builds a 404. `_git-version.json` therefore
carries **both** `dugiteNativeTag` (URL path) and `assetInfix`
(filename), and the script composes the URL from both. No new CI legs.

### D4. Pin the dugite-native release in `_git-version.json`

Mirrors the existing `_node-version.sh` pattern. Schema (pinned to the
latest release `v2.53.0-3` = Git v2.53.0, Git LFS v3.7.1, GCM v2.7.3,
with real hashes verified from the release body):

```json
{
  "dugiteNativeTag": "v2.53.0-3",
  "assetInfix": "v2.53.0-f49d009",
  "sha256": {
    "windows-x64":   "f843a87a693bfdabed83b8492bca59db6f64d1168c74d23e2c8dfb7388a97142",
    "windows-arm64": "e16e7023942499c093c8520a145bf20287a08d38d8d69197355df154a8598b06"
  }
}
```

The `assetInfix` is release-specific (changes on every dugite-native
bump) and must be updated alongside `dugiteNativeTag` and the hashes.

Renovate / Dependabot can be configured later to auto-bump this file.
Out of scope for the initial change.

### D5. Setting key naming

`windowsGitSource` — explicit platform scope in the name avoids
confusion with future non-Windows toggles. Values
`"auto" | "host" | "bundled"`. Locked into the public config contract.

## Non-goals

- Lazy-downloading git at runtime / on first launch (Shape B). Rejected
  in favour of build-time bundle per user direction.
- Bundling git on macOS or Linux. Both ship git system-wide.
- Bundling `rg` (ripgrep) or any non-git/bash binary. Out of scope; can
  be a follow-up change reusing the same `resources/<tool>/` pattern.
- Custom dugite-native build to trim Git LFS / GCM. Defer until size
  complaints arrive.
- Auto-updating the pinned `dugite-native` version. Manual bump for
  now; renovate/dependabot wiring is a follow-up.
- Sandboxed PATH (only bridge children see bundled git, parent shell
  sees host git). The current `ensureWindowsSystemPath` pattern is
  shared-augmentation; we follow it for consistency.

## Risks & open questions

### R1. Symlinks in dugite-native tarball surviving Windows packaging

`dugite-native` uses symlinks inside the tarball to dedupe binaries.
On Linux/macOS extraction these survive. On Windows extraction (ZIP
extraction by end users) symlinks may become file copies, fail without
admin elevation, or silently lose target.

**Packaging correction.** This repo dropped the NSIS installer (archived
`simplify-electron-bootstrap-derived-state`); current Windows
distribution is **ZIP + portable.exe** (`forge package` → unpacked dir →
`Compress-Archive` + 7z SFX). The faithful symlink-survival test is a
**ZIP round-trip**: `Compress-Archive` the extracted tree, then
`Expand-Archive` (the end-user path), then re-probe — that is where
Windows symlink loss is most likely. NSIS returns later via
`restore-windows-nsis-installer`; the spike covers an NSIS package +
silent install as a secondary, forward-looking check.

The spike runs on CI (`windows-latest` for x64, `windows-11-arm` for
real arm64 execution): download tarball, SHA-256 verify, Node-`tar`
extract, probe `git.exe`/`bash.exe`/`sh.exe --version`, ZIP round-trip,
re-probe. Resolve before merge.

### R2. SmartScreen / Defender false positives on bundled bash + DLLs

Bundling `bash.exe` and dozens of unsigned MinGW DLLs trips Windows
Defender heuristics on unsigned installers. dugite-native has known
historical reports. Mitigations:
- The parent NSIS installer is being signed via Azure Trusted Signing
  (change `windows-authenticode-signing`). A signed parent should cover
  the child binaries for SmartScreen reputation purposes.
- Individual `.exe`s inside `resources/git/` remain unsigned (we don't
  re-sign upstream binaries). They are never launched as top-level
  user processes — only spawned by the dashboard, which AV treats
  differently.
- If false positives still occur in QA, document a "Defender exclusion"
  workaround in `docs/faq.md` rather than re-sign every bundled binary.

### R3. Installer size: 232 MB → ~340 MB on Windows

~110 MB increase on Windows only. Mac/Linux unchanged. Acceptable for
a dev tool; download time on residential broadband is still <30s.

### R4. CVE patching cadence

`dugite-native` typically ships ~1–4 weeks behind upstream git releases.
We inherit that lag. For a developer-facing tool used against
already-trusted repos, this is acceptable. Tracked via the pinned
version in `_git-version.json`.

### R5. Bridge `!` / `!!` semantics today on Windows-without-bash

Worth confirming current behaviour: does `command-handler.ts` fail
gracefully, or crash the bridge? This shapes whether the change is a
*fix* (current state is broken) or an *enhancement* (current state is
"feature unavailable"). Task to investigate before final scope lock.

### R6. Order of PATH prepends

`ToolResolver.buildSpawnEnv` calls `ensureWindowsSystemPath` last, which
prepends System32 et al. `ensureBundledGitOnPath` must run **after**
that call so its entries land *before* System32 in PATH — but only when
`selectGitSource()` returned `"bundled"`. `sh.exe` does not exist in
System32, so no shadowing risk on coreutils. R1 spike confirmed the
bundled shell is a real copied binary (not a symlink), so there is no
symlink elevation/loss risk on extraction. Verify in tests. Note the
terminal-manager PTY path does not call `buildSpawnEnv`; its separate
hook must apply the same after-System32 ordering.

## Migration / compatibility / rollback

- **Migration**: none required. The setting `windowsGitSource` defaults
  to `"auto"`, which falls back to host git on systems that already
  have Git for Windows installed → behaviour is byte-identical to today
  for existing users with git installed.
- **Compatibility**: mac/linux behaviour unchanged (setting is no-op).
  Windows users without git installed *gain* working agents — that is
  the intended new behaviour.
- **Rollback**: revert the change set. `resources/git/` disappears from
  the bundle. Users without host git regress to today's broken state;
  users with host git see no change because they were already on the
  host-path code branch.
- **Forward-compat**: if a future change wants to lazy-download instead
  (Shape B), the runtime API surface (`selectGitSource`,
  `ensureBundledGitOnPath`) is reusable — only the *source* of
  `resources/git/` changes from build-time to first-run-time. The
  config key `windowsGitSource` accommodates a fourth value (e.g.
  `"lazy"`) without breaking existing configs.
