## Why

The `context-mode` MCP plugin exposes a family of `ctx_*` tools (`ctx_execute`, `ctx_execute_file`, `ctx_batch_execute`, `ctx_search`, `ctx_index`, `ctx_fetch_and_index`, `ctx_insight`). None of them are in the client's tool-renderer registry, so every one falls through to `GenericToolRenderer`, which dumps `JSON.stringify(args, null, 2)` followed by the raw result text.

These tools are high-frequency — a scan of 112 local sessions found ~2,150 `ctx_*` calls, with `ctx_execute` alone at 1,865. So the most-used tool surface in those sessions renders as an unreadable JSON blob: a `code` field with escaped newlines, a `commands[]` array, or a `queries[]` array, none of which a human can scan.

The result text is structured and parseable. Each tool emits a regular summary header (`Executed N commands (N lines, N.NKB). Indexed N sections. Searched N queries.`, `Indexed N sections (N with code) from: <source>`, etc.) plus a predictable body (indexed-section bullet lists, per-query answer blocks). A dedicated renderer can turn this into a compact, scannable card with a header chip and a structured body — matching how `bash`, `read`, `edit`, `write`, and `Agent` already render.

## What Changes

Add a single `CtxToolRenderer` registered for all `ctx_*` tool names, plus a pure text-grammar parser. The renderer switches on `toolName` to pick a per-tool body layout; shared header-chip and error-card logic live in the renderer.

- **Registry.** Register the seven `ctx_*` tool names to one `CtxToolRenderer`. `GenericToolRenderer` remains the fallback for anything still unmapped.
- **Parser.** A pure `parseCtxResult(toolName, result, isError)` module turns the result text into a small typed struct. It strips the leading `⚠️ context-mode v… outdated` noise line, classifies errors (validation / timeout / runtime), and parses each tool's summary header + body.
- **Header chip** (collapsed state) per tool — e.g. `⚙ shell · 42 lines`, `▦ 6 cmds · 31 sections · 5 queries`, `🔍 4 queries`, `🗂 830 sections — docs/`, `🌐 raw.githubusercontent.com · 145 sections`.
- **Body** per tool:
  - `ctx_execute` / `ctx_execute_file`: the `code` argument as a syntax-highlighted block (language from `args.language`; path header for `_file`), then stdout. With `intent`, surface the "N sections matched" preview list.
  - `ctx_batch_execute`: command-label chips, the Indexed Sections list, and per-query answer accordions.
  - `ctx_search`: per-query accordions, each holding source-tagged snippets or a "No results found" badge.
  - `ctx_index` / `ctx_fetch_and_index`: source + section count (+ host/url) as a compact one-liner.
  - `ctx_insight`: a link button to the dashboard URL extracted from the log.
- **Error card.** When `isError`, render a red card with the parsed reason and a collapsible `Received arguments:` JSON block (validation errors carry it).

## Capabilities

### Modified Capabilities

- `tool-renderers`: The renderer registry gains seven `ctx_*` → `CtxToolRenderer` mappings. A new `CtxToolRenderer` requirement defines the per-tool card layouts. A new parser requirement defines the result-text grammar the renderer depends on. `GenericToolRenderer` stays the fallback for unmapped tools.

## Decisions baked in (resolved during explore)

1. **One renderer, switch on `toolName`** — not seven files. The seven tools share header-chip, noise-stripping, and error-card logic; a single component with a `switch` keeps that DRY. (Departs from the one-file-per-tool convention deliberately; documented in design.md.)
2. **Parse the result *text*, not `details`** — verified against 2,155 real `ctx_*` results that `toolResult.details` is **always `{}`** and `content` is always a single `text` item. There is no machine-readable payload; text parsing is the only option.
3. **Structured parse for `ctx_search` and `ctx_batch_execute`** — their bodies are regular enough (`## <query>`, `### <section>`, `--- [scope | date | src] ---`, `## Indexed Sections`) to parse into accordions.

## Impact

**Code touched:**
- `packages/client/src/components/tool-renderers/CtxToolRenderer.tsx` — **new**. Single renderer, switches on `toolName`. Shared header chip + error card; per-tool body.
- `packages/client/src/components/tool-renderers/parse-ctx-result.ts` — **new**. Pure parser: `parseCtxResult(toolName, result, isError) → CtxResult` typed union. No React.
- `packages/client/src/components/tool-renderers/registry.ts` — register the seven `ctx_*` names to `CtxToolRenderer`.
- `packages/client/src/components/ToolCallStep.tsx` — optional: add `ctx_*` entries to `toolSummaries` so the collapsed header line reads better before expand (parser-free, args-only summary).
- Tests: `parse-ctx-result.test.ts` (grammar fixtures from real session captures), `CtxToolRenderer.test.tsx` (per-tool render + error + noise-strip).

**Not touched:**
- `GenericToolRenderer.tsx` — unchanged; remains the registry fallback.
- Server / shared / extension — `ctx_*` is an MCP plugin tool; the dashboard only renders its `toolResult`. No wire-protocol change.

## Resolved Questions

All three explore-phase open questions were resolved 2026-06-02 (see design.md → Resolved Questions). Resolutions are binding:

1. **Parser brittleness vs. context-mode version drift → raw-fallback contract is binding.** `parseCtxResult` never throws; every arm returns `{ kind: "raw", text }` on a header miss, degrading the card to "header chip from args + linkified raw body" — strictly better than today's JSON dump.
2. **Open-ended `ctx_*` set → prefix-match safety net.** Registry keeps the seven explicit entries; `getToolRenderer` routes any unmapped `ctx_`-prefixed name to `CtxToolRenderer` (rendered as `{ kind: "raw" }`). New tools (`ctx_stats`, `ctx_doctor`, `ctx_purge`) need no code change.
3. **Batch/search snippet volume → collapsed accordions + `max-h-80` scroll.** Per-query / per-section blocks default collapsed; body region height-capped with internal scroll, matching `BashToolRenderer`. Header chip always visible.
