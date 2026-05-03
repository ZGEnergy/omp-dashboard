# Fix: PathPicker rejects Windows paths ending in `\`

## Why

`PathPicker.tryConfirm()` (Rule 2) only accepts the trailing-separator
shortcut when the input ends with `/`:

```ts
if (inputValue.endsWith("/") && fetchedDirRef.current === p) {
  onSelect(inputValue);
  return true;
}
```

On Windows, every code path that writes the input value uses the
OS-native separator:

- `descendInto()` calls `withTrailingSep(dirPath, "win32")` after the user
  picks an entry from the list → input becomes `C:\Users\me\`.
- The initial fetch effect calls
  `setInputValue(withTrailingSep(result.current, platform))` → same shape.

When the user then hits Enter (or clicks **Select**) without typing a
partial name:

- Rule 1 needs `partial` (none) → skip.
- Rule 2 checks `inputValue.endsWith("/")` → `false` for `C:\Users\me\` → skip.
- Rule 3 needs `partial` → skip.
- `tryConfirm` returns `false` → `triggerInvalid()` red-flashes the input.

The user is unable to confirm any directory whose input ends with `\`,
which is the **default state** the picker itself produces after every
successful navigation step on Windows. UNC paths (`\\server\share\`) hit
the same wall.

The Pin Directory dialog inherits this bug because it wraps `PathPicker`
unchanged.

## What Changes

- Modify `PathPicker.tryConfirm()` Rule 2 to accept either `/` or `\` as
  the trailing-separator shortcut. The downstream `onSelect` callback
  already normalizes the path (Pin Directory runs it through
  `normalizePath`); no other call site relies on the literal trailing
  character.
- Update `openspec/specs/filesystem-browser/spec.md` to reword the
  "Enter on trailing-slash current directory selects and closes"
  scenario in OS-aware terms, plus add an explicit Windows scenario.
- Add Windows-platform unit tests to
  `packages/client/src/components/__tests__/PathPicker.test.tsx`
  covering both Enter and the Select button confirming a `C:\…\` input.

## Impact

- **Affected specs**: `filesystem-browser` — one MODIFIED scenario, one
  ADDED scenario. No new requirement.
- **Affected code**:
  - `packages/client/src/components/PathPicker.tsx` — single-line
    condition change in `tryConfirm`.
  - `packages/client/src/components/__tests__/PathPicker.test.tsx` —
    new Windows confirmation test cases.
- **Backwards compatibility**: POSIX behaviour unchanged (existing
  `endsWith("/")` test continues to pass). Windows behaviour switches
  from "always rejects" to "matches POSIX". No callers depend on the
  invalid-flash response for `\`-terminated input.
- **Risk**: minimal. The change strictly widens what `tryConfirm` will
  accept; nothing previously accepted is now rejected.
