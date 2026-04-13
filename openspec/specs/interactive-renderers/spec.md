# interactive-renderers Specification

## Purpose
TBD - created by archiving change ask-user-message-body. Update Purpose after archive.
## Requirements
### Requirement: InputRenderer displays message body
The InputRenderer SHALL display `params.message` as a markdown body below the title when in pending state, using the same visual pattern as ConfirmRenderer.

#### Scenario: pending input with message
- **WHEN** an input dialog is pending with `params.message` set
- **THEN** the renderer SHALL display the message as `<MarkdownContent>` in `text-xs text-[var(--text-secondary)]` below the title and above the input field

#### Scenario: pending input without message
- **WHEN** an input dialog is pending with no `params.message`
- **THEN** the renderer SHALL display only the title (no empty body area)

#### Scenario: resolved input with message
- **WHEN** an input dialog is resolved/cancelled/dismissed
- **THEN** the collapsed one-liner SHALL show only the title (message is hidden in compact state)

### Requirement: SelectRenderer displays message body
The SelectRenderer SHALL display `params.message` as a markdown body below the title when in pending state.

#### Scenario: pending select with message
- **WHEN** a select dialog is pending with `params.message` set
- **THEN** the renderer SHALL display the message as `<MarkdownContent>` below the title and above the option buttons

#### Scenario: pending select without message
- **WHEN** a select dialog is pending with no `params.message`
- **THEN** the renderer SHALL display only the title

### Requirement: MultiselectRenderer displays message body
The MultiselectRenderer SHALL display `params.message` as a markdown body below the title when in pending state.

#### Scenario: pending multiselect with message
- **WHEN** a multiselect dialog is pending with `params.message` set
- **THEN** the renderer SHALL display the message as `<MarkdownContent>` below the title and above the checkboxes

#### Scenario: pending multiselect without message
- **WHEN** a multiselect dialog is pending with no `params.message`
- **THEN** the renderer SHALL display only the title

