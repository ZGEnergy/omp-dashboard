## ADDED Requirements

### Requirement: Windows electron builds embed git + bash via dugite-native

Every electron build leg targeting `platform: win32` SHALL fetch a pinned
`desktop/dugite-native` GitHub Release tarball matching the target arch,
verify it against a SHA-256 recorded in
`packages/electron/scripts/_git-version.json`, and extract it to
`packages/electron/resources/git/` before `electron:make` runs. Builds
targeting `darwin` or `linux` SHALL NOT fetch or extract the tarball.

#### Scenario: Win32 x64 build embeds matching x64 git tarball

- **WHEN** the `_electron-build.yml` matrix leg with
  `platform=win32, arch=x64` runs `bundle-server.mjs`
- **THEN** `packages/electron/resources/git/cmd/git.exe`,
  `packages/electron/resources/git/usr/bin/sh.exe`, and
  `packages/electron/resources/git/THIRD-PARTY-LICENSE.txt` SHALL all
  exist before the `electron:make` step is invoked

#### Scenario: Win32 arm64 build embeds matching arm64 git tarball

- **WHEN** the matrix leg with `platform=win32, arch=arm64` runs
- **THEN** the same three paths SHALL exist, sourced from the
  `dugite-native-v<tag>-windows-arm64.tar.gz` tarball (not the x64 one)

#### Scenario: macOS and Linux builds do NOT embed git

- **WHEN** any matrix leg with `platform in {darwin, linux}` runs
- **THEN** `packages/electron/resources/git/` SHALL NOT exist in the
  produced artifact
- **AND** no network fetch for a `dugite-native` tarball SHALL occur on
  that leg

#### Scenario: SHA-256 mismatch fails the build

- **WHEN** the downloaded tarball's SHA-256 does not match the value
  recorded in `_git-version.json` for the target arch
- **THEN** `download-git-windows.mjs` SHALL exit non-zero before
  extraction
- **AND** the leg SHALL fail with a clear "checksum mismatch — refusing
  to extract" error

#### Scenario: GO/NO-GO guard on incomplete embed

- **WHEN** any of `resources/git/cmd/git.exe`,
  `resources/git/usr/bin/sh.exe`, or
  `resources/git/THIRD-PARTY-LICENSE.txt` is missing on a win32 target
- **THEN** `bundle-server.mjs` SHALL fail the build with a "bundled git
  GO/NO-GO failed" error listing the missing paths

### Requirement: Bundled git ships with verbatim GPL v2 attribution

The Windows electron bundle SHALL include a verbatim copy of the GPL v2
text and the MSYS2/MinGW64 transitive notices used by dugite-native,
plus a pointer to the corresponding-source location, in
`resources/git/THIRD-PARTY-LICENSE.txt`. The Electron About dialog SHALL
expose a link to this file when running on Windows.

#### Scenario: License file is present and non-empty

- **WHEN** any win32 build artifact is unpacked
- **THEN** `resources/git/THIRD-PARTY-LICENSE.txt` SHALL contain the
  string `GNU GENERAL PUBLIC LICENSE` and the URL
  `https://github.com/desktop/dugite-native`

#### Scenario: About dialog links to the license file (Windows)

- **WHEN** the user opens the Electron About dialog on Windows
- **THEN** a row "Bundled Git for Windows v<version>" SHALL be visible
- **AND** clicking it SHALL open `resources/git/THIRD-PARTY-LICENSE.txt`
  in the system default text viewer
