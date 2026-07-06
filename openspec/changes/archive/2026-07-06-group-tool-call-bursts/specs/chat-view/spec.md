## ADDED Requirements

### Requirement: Consecutive tool-call bursts collapse into a progress-aware group

The chat view SHALL collapse a maximal run of consecutive `toolResult` rows into a single **burst group** when the run contains 3 or more `toolResult` members. The run walks across TRANSPARENT rows (`thinking`, `turnSeparator`, `rawEvent`, `commandFeedback`, and **empty** `assistant` rows with no text) without breaking; a HARD row (`user`, **non-empty** `assistant` prose, `interactiveUi`, `bashOutput`, `inlineTerminal`, or any other role) terminates the run. Runs of fewer than 3 members SHALL emit every consumed row verbatim — including intermediate transparent rows in original order — so a non-forming run renders byte-identical to before this change.

Burst grouping is a second, temporal axis composed as the OUTER pass: it runs first over the raw message array with its own boundary rules, then the existing identical-call collapse runs INSIDE each formed burst, over the burst's `toolResult` members, folding identical sub-runs into nested `×N` lines. Burst grouping SHALL NOT replace or alter the identical-call collapse helper.

#### Scenario: Heterogeneous burst collapses
- **GIVEN** 8 consecutive `toolResult` rows of mixed tools (`grep`, `Read`, `git`) with differing args, none running
- **WHEN** the chat renders
- **THEN** a single burst group SHALL render in place of the 8 rows, and no individual member row SHALL appear at the top level

#### Scenario: Sub-threshold run renders verbatim
- **GIVEN** 2 consecutive `toolResult` rows separated by a `turnSeparator`
- **WHEN** the chat renders
- **THEN** both rows SHALL render as standalone rows and no burst group SHALL form

#### Scenario: Assistant prose terminates the burst
- **GIVEN** 4 `toolResult` rows, then a non-empty `assistant` message, then 4 more `toolResult` rows
- **WHEN** the chat renders
- **THEN** two separate burst groups SHALL form, split at the prose row, and the prose SHALL render between them

#### Scenario: Semantic ×N group nests inside a burst
- **GIVEN** a burst containing two distinct `toolResult` rows and a run of 24 identical `curl` calls
- **WHEN** the burst is expanded
- **THEN** the 24 identical calls SHALL render as a single nested `×24` line among the individual member rows, not as 24 rows

### Requirement: Running bursts group live, auto-expanded, with an honest count

While a burst contains a member whose `toolStatus` is `running`, the burst SHALL form INCLUDING that running member (overriding the identical-call rule that never groups running tools) and SHALL render in the EXPANDED state so the live tool stays visible. The group header SHALL show an indeterminate spinner, the title `Working`, a `"N done"` count of COMPLETED visible members only, and the summary of the currently-running member. The header SHALL NOT display a total-count denominator or a determinate progress bar.

When the burst boundary is reached and no member is running, the group SHALL render in the COLLAPSED state with a completion check, the title `"N tool calls"`, a tool-kind breakdown, and an aggregate duration. A user's manual toggle of a specific group instance SHALL override the automatic expanded/collapsed default for that instance.

#### Scenario: Running burst is expanded with live command
- **GIVEN** a burst of 12 completed members followed by a 13th member with `toolStatus: "running"`
- **WHEN** the chat renders
- **THEN** the burst SHALL render expanded, the header SHALL read `Working` with `12 done` and the running member's summary, and no total denominator SHALL appear

#### Scenario: Completed burst auto-collapses
- **WHEN** the last member of a burst completes and a HARD row follows (or the list ends with no running member)
- **THEN** the burst SHALL render collapsed with a check, `"N tool calls"`, and an aggregate duration

#### Scenario: Count excludes the running member
- **GIVEN** a burst with 5 completed members and 1 running member
- **THEN** the header count SHALL read `5 done`, not `6`

### Requirement: Burst expansion is a bounded scrollbox and honours display preferences

An expanded burst SHALL render every visible member inside a fixed-max-height scroll container with NO inner elision or windowing. Members gated off by the tool-kind display preferences (`chat-display-preferences`) SHALL be excluded before counting and rendering, using the same gating as the identical-call collapse; a burst whose every member is gated off SHALL render nothing. Header counts SHALL be over VISIBLE underlying tool calls (a nested `×N` contributes N), while the formation threshold SHALL count `toolResult` members (a nested `×N` counts as one member).

#### Scenario: Counting is over underlying calls, threshold over members
- **GIVEN** a burst of two distinct `toolResult` rows plus a run of 24 identical calls
- **THEN** the burst SHALL form (3 members ≥ threshold) AND the done header SHALL read `26 tool calls`, not `3`

#### Scenario: Auto-collapse does not jump the scroll position
- **GIVEN** a running burst rendered expanded while the user has scrolled up into history (not pinned to bottom)
- **WHEN** the last running member completes and the burst auto-collapses from the scrollbox to a one-line summary
- **THEN** the chat SHALL preserve the user's scroll anchor so the visible content does not jump

#### Scenario: Expanded burst renders all members in a scrollbox
- **GIVEN** an expanded burst of 30 members
- **WHEN** it renders
- **THEN** all 30 visible members SHALL be present in the DOM inside a single scroll container, with no "N more" elision band

#### Scenario: Fully-gated burst renders nothing
- **GIVEN** a burst whose every member is a tool kind toggled off in display preferences
- **WHEN** the chat renders
- **THEN** the burst SHALL render `null` (no header, no container)

#### Scenario: Gating adjusts the visible count
- **GIVEN** a burst of 10 members where 3 are a tool kind toggled off
- **THEN** the header count SHALL reflect 7 visible members, not 10
