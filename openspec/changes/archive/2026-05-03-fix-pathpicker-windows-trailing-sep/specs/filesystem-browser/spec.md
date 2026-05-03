## MODIFIED Requirements

### Requirement: PathPicker Enter / Select confirmation rules

The PathPicker SHALL evaluate Enter (and the footer **Select** button)
against an ordered set of rules, calling `onSelect` only when one of the
rules matches and otherwise showing a brief invalid-input indicator.

The trailing-separator shortcut SHALL be OS-aware: the input MAY end
with the POSIX separator `/` OR the Windows separator `\` (including
UNC paths terminated by `\`). The picker SHALL NOT reject an input
solely because its trailing character is the OS-native separator that
the picker itself wrote during the prior navigation step
(`descendInto` + `withTrailingSep`, or the initial fetch effect on
mount).

#### Scenario: Enter on exact match selects and closes

- **WHEN** the user presses Enter AND the trimmed partial matches a visible entry name (case-insensitive)
- **THEN** `onSelect` SHALL be called with that entry's absolute path
- **AND** the picker SHALL close

#### Scenario: Enter on trailing-separator current directory selects and closes

- **WHEN** the user presses Enter AND the input ends with the OS-native separator (`/` on POSIX, `\` on Windows, `/` also accepted for forward-slash Windows input) AND the parsed parent equals the currently-fetched directory
- **THEN** `onSelect` SHALL be called with the current input value
- **AND** the picker SHALL close

#### Scenario: Enter on Windows backslash-terminated path selects and closes

- **GIVEN** a Windows session where the picker has navigated to `C:\Users\me` and `inputValue` is `"C:\\Users\\me\\"` (the form `descendInto` produces via `withTrailingSep(_, "win32")`)
- **WHEN** the user presses Enter without typing any partial name
- **THEN** `onSelect` SHALL be called once with `"C:\\Users\\me\\"`
- **AND** the picker SHALL close
- **AND** the input SHALL NOT show the invalid-flash indicator

#### Scenario: Select button on Windows backslash-terminated path selects and closes

- **GIVEN** the same Windows setup as above
- **WHEN** the user clicks the footer **Select** button
- **THEN** `onSelect` SHALL be called once with the input value (same outcome as Enter)

#### Scenario: Enter on single candidate completes (does not close)

- **WHEN** the user presses Enter AND there is exactly one filtered candidate AND the partial is NOT an exact match
- **THEN** the input SHALL become `candidate.path` followed by the OS-native separator
- **AND** the list SHALL refetch for the new directory
- **AND** `onSelect` SHALL NOT be called

#### Scenario: Enter on non-existent path is a no-op

- **WHEN** the user presses Enter AND none of the above rules apply (no exact match, zero or multiple candidates, input does not end with `/` or `\`)
- **THEN** `onSelect` SHALL NOT be called
- **AND** the picker SHALL remain open
- **AND** the input SHALL show a brief visual "invalid" indicator (e.g. red outline or shake)

#### Scenario: Select button follows Enter rules

- **WHEN** the user clicks the footer **Select** button
- **THEN** the component SHALL apply the same rules as Enter above (never confirming a non-existent path)
