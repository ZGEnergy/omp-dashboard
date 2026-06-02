## MODIFIED Requirements

### Requirement: Tool renderer registry
The client SHALL maintain a registry mapping tool names to renderer components. A `getToolRenderer(toolName)` function SHALL return the specialized renderer for known tools, route any unmapped tool whose name begins with `ctx_` to `CtxToolRenderer`, and otherwise fall back to `GenericToolRenderer`.

Built-in renderers:
- `read` → `ReadToolRenderer`
- `edit` → `EditToolRenderer`
- `write` → `WriteToolRenderer`
- `bash` → `BashToolRenderer`
- `ctx_execute`, `ctx_execute_file`, `ctx_batch_execute`, `ctx_search`, `ctx_index`, `ctx_fetch_and_index`, `ctx_insight` → `CtxToolRenderer`
- Other tools named `ctx_*` → `CtxToolRenderer`
- All others → `GenericToolRenderer`

#### Scenario: Known tool renders with specialized view
- **WHEN** a tool call for "read" is displayed
- **THEN** the `ReadToolRenderer` SHALL be used

#### Scenario: Known ctx tool renders with ctx view
- **WHEN** a tool call for "ctx_search" is displayed
- **THEN** the `CtxToolRenderer` SHALL be used

#### Scenario: Unmapped ctx-prefixed tool routes to ctx renderer
- **WHEN** a tool call for "ctx_stats" (not in the explicit map) is displayed
- **THEN** the `CtxToolRenderer` SHALL be used

#### Scenario: Unknown non-ctx tool uses generic renderer
- **WHEN** a tool call for "custom_tool" is displayed
- **THEN** the `GenericToolRenderer` SHALL be used

## ADDED Requirements

### Requirement: ctx result parser
A pure module SHALL expose `parseCtxResult(toolName, result, isError)` returning a typed `CtxResult` union with one of the kinds: `error`, `execute`, `batch`, `search`, `index`, `fetch`, `insight`, or `raw`. The parser SHALL NOT import React and SHALL be unit-testable in isolation.

The parser SHALL first strip a leading noise line matching the context-mode upgrade banner (`⚠️ context-mode v… outdated …`) before classifying the result. Every parse branch SHALL return `{ kind: "raw", text }` when its expected header does not match, and SHALL NOT throw on malformed input.

#### Scenario: Strips upgrade banner
- **GIVEN** a result whose first line is `⚠️ context-mode v1.0.161 outdated → v1.0.162 available. Upgrade: npm run build`
- **WHEN** the parser runs
- **THEN** the returned struct's rendered body SHALL NOT contain the banner line

#### Scenario: Parses batch summary header
- **GIVEN** a `ctx_batch_execute` result starting with `Executed 6 commands (816 lines, 62.8KB). Indexed 31 sections. Searched 5 queries.`
- **WHEN** the parser runs
- **THEN** it SHALL return `{ kind: "batch" }` with summary fields `commands=6`, `sections=31`, `queries=5`

#### Scenario: Parses index header
- **GIVEN** a `ctx_index` result `Indexed 830 sections (169 with code) from: docs/`
- **WHEN** the parser runs
- **THEN** it SHALL return `{ kind: "index", sections: 830, withCode: 169, source: "docs/" }`

#### Scenario: Classifies validation error
- **GIVEN** `isError` is true and the result starts with `Validation failed for tool "ctx_batch_execute":`
- **WHEN** the parser runs
- **THEN** it SHALL return `{ kind: "error", variant: "validation" }` with the `Received arguments:` JSON captured into `receivedArgs`

#### Scenario: Classifies timeout error
- **GIVEN** `isError` is true and the result is `MCP request timeout after 120000ms: tools/call`
- **WHEN** the parser runs
- **THEN** it SHALL return `{ kind: "error", variant: "timeout" }`

#### Scenario: Malformed result falls back to raw
- **GIVEN** a `ctx_search` result whose body does not match the expected `## <query>` grammar
- **WHEN** the parser runs
- **THEN** it SHALL return `{ kind: "raw", text }` and SHALL NOT throw

### Requirement: CtxToolRenderer
A single `CtxToolRenderer` component SHALL render all `ctx_*` tool calls. It SHALL call `parseCtxResult`, render a per-tool header chip from the parsed struct, and select a body layout by result kind. The renderer SHALL NOT render the tool arguments as raw JSON for the recognized kinds.

#### Scenario: Header chip per tool
- **WHEN** a `ctx_batch_execute` result parses to a batch summary with 6 commands, 31 sections, 5 queries
- **THEN** the collapsed card header SHALL show a chip summarizing command count, section count, and query count (e.g. `6 cmds · 31 sections · 5 queries`)

#### Scenario: Execute body shows code and stdout
- **WHEN** a `ctx_execute` tool call has `args.language = "shell"` and a non-empty `code` argument and a stdout result
- **THEN** the card SHALL render the `code` argument as a code block and the stdout below it
- **AND** the card SHALL NOT render `JSON.stringify(args)`

#### Scenario: Execute_file body shows path header
- **WHEN** a `ctx_execute_file` tool call has a `path` argument
- **THEN** the card SHALL render the file path as a header above the code block

#### Scenario: Search body renders per-query accordions
- **WHEN** a `ctx_search` result contains two `## <query>` blocks, one with snippets and one with `No results found.`
- **THEN** the card SHALL render two accordions, the first listing source-tagged snippets and the second showing a "no results" indicator

#### Scenario: Batch body renders sections and query answers
- **WHEN** a `ctx_batch_execute` result contains an Indexed Sections list and per-query answer blocks
- **THEN** the card SHALL render the section list and one collapsible accordion per query answer
- **AND** the body region SHALL be height-capped with internal scroll

#### Scenario: Index body is a compact one-liner
- **WHEN** a `ctx_index` result parses to `{ kind: "index" }`
- **THEN** the card SHALL render a single line with the section count and source, without a code block

#### Scenario: Fetch body shows source and url
- **WHEN** a `ctx_fetch_and_index` result parses to `{ kind: "fetch" }` with a source and url
- **THEN** the card SHALL render the section count, source label, and the originating url/host

#### Scenario: Insight body shows dashboard link
- **WHEN** a `ctx_insight` result contains a `http://localhost:<port>` url
- **THEN** the card SHALL render a link/button to that url

#### Scenario: Error kind renders error card
- **WHEN** the parsed result is `{ kind: "error", variant: "validation", receivedArgs }`
- **THEN** the card SHALL render an error-styled body with the reason and a collapsible `Received arguments:` block

#### Scenario: Raw fallback still renders a card
- **WHEN** the parsed result is `{ kind: "raw", text }`
- **THEN** the card SHALL render the stripped text as a linkified body with the tool-name header
- **AND** the card SHALL NOT render `JSON.stringify(args)`
