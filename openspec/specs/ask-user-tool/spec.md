# ask-user-tool Specification

## Purpose
TBD - created by archiving change ask-user-message-body. Update Purpose after archive.
## Requirements
### Requirement: ask_user tool parameters
The `ask_user` tool SHALL accept a `message` parameter (optional string) described as "Additional context or detailed question body (all methods)" that works with all methods, not just confirm.

#### Scenario: LLM provides message with input method
- **WHEN** the LLM calls `ask_user` with `{method: "input", title: "Check log", message: "Run this command:\n```\ntype log.txt\n```"}`
- **THEN** the tool SHALL pass `message` through `opts.message` to `ctx.ui.input()`

#### Scenario: LLM provides message with select method
- **WHEN** the LLM calls `ask_user` with `{method: "select", title: "Pick one", message: "Context about the choice", options: ["A", "B"]}`
- **THEN** the tool SHALL pass `message` through `opts.message` to `ctx.ui.select()`

#### Scenario: LLM provides message with multiselect method
- **WHEN** the LLM calls `ask_user` with `{method: "multiselect", title: "Pick items", message: "Select all that apply"}`
- **THEN** the tool SHALL pass `message` through `opts.message` to `ctx.ui.multiselect()`

#### Scenario: No message provided
- **WHEN** the LLM calls `ask_user` without a `message` field
- **THEN** the tool SHALL behave identically to the current implementation (backward compatible)

