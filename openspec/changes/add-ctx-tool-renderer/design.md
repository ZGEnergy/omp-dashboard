## Context

Explored 2026-06-02. The trigger: `ctx_*` MCP tools render as raw JSON in the chat because they have no registry entry and fall through to `GenericToolRenderer`. Investigation harvested ~2,150 real `ctx_*` call/result pairs from 112 local session `.jsonl` files to reverse-engineer the exact arg shapes and result-text grammar, and confirmed the rendering pipeline (`ToolCallStep` → `getToolRenderer` → `registry.ts` Map → `GenericToolRenderer` fallback).

Three questions were settled in-session:
- One renderer or seven? → **One** (`CtxToolRenderer`, switch on `toolName`).
- Parse result text or read `details`? → **Parse text**; `details` is always `{}` (verified across all 2,155 results).
- How deep a parse for search/batch? → **Structured** (accordions), with a raw-text fallback when the grammar misses.

## Evidence (from session-history scan)

Wire shape per `ctx_*` interaction:

```
assistant content[] item: { type:"toolCall", id, name:"ctx_…", arguments:{…} }
toolResult message:        { role:"toolResult", toolCallId, toolName:"ctx_…",
                             content:[{ type:"text", text }], details:{}, isError }
```

Argument keys observed:

| tool | n | args keys |
|---|---|---|
| `ctx_execute` | 1865 | `language, code, timeout, intent` |
| `ctx_batch_execute` | 171 | `commands[{label,command}], queries[], concurrency, timeout` |
| `ctx_execute_file` | 59 | `path, language, code, intent` |
| `ctx_search` | 37 | `queries[], source, limit, sort` |
| `ctx_index` | 10 | `path, source` |
| `ctx_fetch_and_index` | 4 | `url \| requests[], source, concurrency` |
| `ctx_insight` | 1 | (none) |

`details` non-empty count across 2,155 results: **0**. `content` is always exactly one `text` item.

## Decisions

### Decision 1: One `CtxToolRenderer`, switch on `toolName`

The existing convention is one file per tool (`ReadToolRenderer`, `BashToolRenderer`, …). `ctx_*` deliberately departs from it because the seven tools share three cross-cutting concerns: (a) strip the `⚠️ context-mode v… outdated` noise line, (b) classify `isError` into validation/timeout/runtime, (c) render a header chip. Seven files would duplicate all three. A single component with a `switch (toolName)` for the body keeps it DRY; the registry maps all seven names to it.

**Tradeoff:** `CtxToolRenderer` is larger than a single per-tool renderer. Acceptable — the body branches are small and the shared chrome dominates.

### Decision 2: Parser is a pure module, separate from the renderer

`parse-ctx-result.ts` exports `parseCtxResult(toolName, result, isError): CtxResult` returning a typed union. No React. This makes the brittle grammar unit-testable in isolation against captured fixtures, and lets the renderer stay declarative.

```
type CtxResult =
  | { kind: "error"; variant: "validation"|"timeout"|"runtime"; message: string; receivedArgs?: string }
  | { kind: "execute"; language?: string; path?: string; stdout: string; intent?: IntentPreview }
  | { kind: "batch"; summary: BatchSummary; sections: SectionRow[]; queries: QueryBlock[] }
  | { kind: "search"; queries: QueryBlock[] }
  | { kind: "index"; sections: number; withCode?: number; source: string }
  | { kind: "fetch"; sections: number; size: string; source: string; url?: string }
  | { kind: "insight"; url?: string; log: string }
  | { kind: "raw"; text: string }    // fallback when grammar misses
```

### Decision 3: Grammar with guaranteed raw fallback

Every parse arm wraps its regex matching and returns `{ kind: "raw", text }` when the expected header does not match. This means a future context-mode format change degrades the card to "header from args + raw body" — never throws, never renders worse than today's generic (it still drops the JSON-args dump). The renderer always has a valid struct to render.

Grammar (derived from real results):

```
stripNoise: drop leading /^⚠️ context-mode v.*$/ line.

error (isError):
  /^Validation failed for tool "(ctx_\w+)":/  → variant=validation; capture reason lines
                                                  + "Received arguments:" JSON tail
  /^MCP request timeout after (\d+)ms/        → variant=timeout
  /^(Runtime error|Batch execution error): (.+)/ → variant=runtime

ctx_batch_execute:
  /^Executed (\d+) commands \((\d+) lines, ([\d.]+\w?B)\)\. Indexed (\d+) sections\. Searched (\d+) queries\./
  "## Indexed Sections" → list of `- <label> (<size>)`
  per "## <query>": "### <section>" blocks, or "No results found."

ctx_search:
  per "## <query>": "--- [<scope> | <date> | <src>] ---" + "### <title>" + snippet, or "No results found."

ctx_execute / ctx_execute_file:
  no intent → stdout = body
  with intent → /^Indexed (\d+) sections from "(.+?)"/ + /^(\d+) sections matched "(.+?)" \((\d+) lines, ([\d.]+\w?B)\):/ + bullet previews

ctx_index:           /^Indexed (\d+) sections \((\d+) with code\) from: (.+)$/
ctx_fetch_and_index: /Fetched and indexed \*\*(\d+) sections\*\* \(([\d.]+\w?B)\) from: (.+?)(?:::(.+))?$/
ctx_insight:         last /http:\/\/localhost:\d+\S*/ → url
```

### Decision 4: Register by exact list, prefix-match as safety net

Register the seven known names explicitly in `registry.ts`. Additionally, `getToolRenderer` (or the renderer's switch) treats any unmapped `toolName` starting with `ctx_` as a `{ kind: "raw" }` ctx card (header = tool name, body = stripped text). This forward-compats `ctx_stats`/`ctx_doctor`/`ctx_purge` without a code change, while keeping the common seven richly rendered.

**Note:** prefix handling lives in the renderer/parser, not as a registry wildcard, because the registry is a plain `Map<string, ToolRenderer>`. The explicit seven entries are what route to `CtxToolRenderer`; a tiny addition to `getToolRenderer` routes `ctx_`-prefixed unknowns there too.

### Decision 5: Accordions default-collapsed, body scroll-capped

`ctx_batch_execute` and `ctx_search` answer blocks can be multi-KB. Per-query / per-section blocks render as collapsed accordions; the whole body uses `max-h-80 overflow-auto` like `BashToolRenderer`. Header chip is always visible.

## Risks / Trade-offs

- **Grammar drift.** Mitigated by Decision 3's raw fallback. Fixtures captured from real sessions pin current behavior; a context-mode bump that changes wording degrades gracefully.
- **Renderer size.** Decision 1 accepts a larger single file in exchange for no duplicated chrome.
- **No structured payload.** Decision 2/3 accept text parsing as the only path (verified). If context-mode ever adds structured `details`, the parser can be superseded by reading `toolDetails` (already plumbed for Agent tools) without touching the renderer's body layouts.

## Migration Plan

Purely additive. No data migration. Before: `ctx_*` → `GenericToolRenderer` (JSON). After: `ctx_*` → `CtxToolRenderer` (cards). Removing the change reverts to generic rendering with no residue.

## Resolved Questions

All three explore-phase open questions were resolved 2026-06-02; resolutions are now binding decisions above.

- **Q1 — parser brittleness vs. context-mode drift.** RESOLVED: the raw-fallback contract (Decision 3) is binding. `parseCtxResult` never throws; every arm returns `{ kind: "raw", text }` on a header miss. A context-mode format change degrades the card to "header chip from args + linkified raw body" — strictly better than today's JSON dump. The parser is the only fragile surface and it fails soft.
- **Q2 — open-ended `ctx_*` set.** RESOLVED: prefix-match safety net (Decision 4). Registry keeps the seven explicit entries; `getToolRenderer` additionally routes any unmapped `ctx_`-prefixed name to `CtxToolRenderer`, which renders it as `{ kind: "raw" }`. New tools (`ctx_stats`, `ctx_doctor`, `ctx_purge`) need zero code change. Prefix logic lives in `getToolRenderer`, not as a Map wildcard.
- **Q3 — batch/search snippet volume.** RESOLVED: per-query / per-section blocks default collapsed; body region uses `max-h-80 overflow-auto`, matching `BashToolRenderer` (Decision 5). Header chip always visible. Same defaults on mobile and desktop.
