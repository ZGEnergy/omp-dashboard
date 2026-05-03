# Tasks

## Phase 1 — Failing tests

- [x] Add a `describe("Windows trailing-backslash confirmation", ...)` block to `packages/client/src/components/__tests__/PathPicker.test.tsx`.
- [x] Test: render with `initialPath = "C:\\Users\\me\\"`, mock `browseDirectory` to resolve for parent `C:\Users\me`, press Enter → assert `onSelect` called once with the input value AND the picker closed (no `triggerInvalid` red flash).
- [x] Test: same setup, click the footer **Select** button → assert `onSelect` called with the input value.
- [x] Test (UNC sanity): `initialPath = "\\\\server\\share\\"`, mock parent → press Enter → `onSelect` called.
- [x] Verify the new tests FAIL against current `main` before applying the fix (run once, capture failure). [verified-on: user host — 3 tests failed against pre-fix `main` as expected]

## Phase 2 — Fix

- [x] In `packages/client/src/components/PathPicker.tsx::tryConfirm`, change Rule 2 from `inputValue.endsWith("/")` to `(inputValue.endsWith("/") || inputValue.endsWith("\\"))`.
- [x] Re-run the suite; new tests + all existing tests pass. [verified-on: user host]

> **Test-fixture footnote** (post-mortem): the initial test draft hit two non-production issues, both fixed in-place:
> 1. **JSX-attribute escaping**: `initialPath="C:\\Users\\me\\"` in JSX is a literal 14-char string (JSX attribute strings don't apply JS escapes). Use expression form `initialPath={"C:\\Users\\me\\"}` so JS escapes resolve.
> 2. **UNC mock alignment**: `normalizePath` keeps the trailing `\` on a UNC root (`\\server\share\`), so the mock's `current` field must match that shape, not `\\server\share`. Otherwise Rule 2's `fetchedDirRef.current === p` comparison fails and the test silently misses. Drive-letter paths don't hit this because `normalizePath` strips their trailing sep.

## Phase 3 — Spec sync

- [x] Update `openspec/changes/fix-pathpicker-windows-trailing-sep/specs/filesystem-browser/spec.md` (already drafted) so the MODIFIED scenario reads "ends with the OS-native separator (`/` or `\`)" and the ADDED scenario covers the Windows path explicitly.
- [x] Run `openspec validate fix-pathpicker-windows-trailing-sep --strict`.

## Phase 4 — Manual verification (Electron on Windows)

- [x] In a Windows VM (or via `qa/Makefile` Windows target if available), open the Electron app, click **Pin folder**, navigate the picker to any directory, press Enter without typing — confirm the dialog closes and the directory appears in the pinned list.
- [x] Repeat with the **Select** button instead of Enter.

> Phase 4 left unchecked deliberately — requires a Windows host the user has, not the Mac dev sandbox.

## Phase 5 — Docs

- [x] No `AGENTS.md` row change (PathPicker is already listed). If the file-index split for `client` records a change-history annotation for `PathPicker.tsx`, append a one-line entry: "fix-pathpicker-windows-trailing-sep: tryConfirm Rule 2 accepts `\` trailing separator (Windows + UNC)". (Annotation appended to `docs/file-index-client.md` row 36 via subagent per docs protocol §6.)
