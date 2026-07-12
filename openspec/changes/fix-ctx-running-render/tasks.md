## 1. Args-derived header chip

- [ ] 1.1 Add `argsChip(toolName, args)` to `CtxToolRenderer.tsx` — returns emoji chips from `args`: batch `▦ N cmds` (`args.commands.length`), execute/execute_file `⚙ <language>`, search `🔍 N queries` (`args.queries.length`), fetch `🌐 <host>` (`hostOf(args.url ?? args.requests[0].url ?? args.source)`), index `🗂 <source|path>`; last-resort `toolName` for a genuinely unknown `ctx_*`.
- [ ] 1.2 Swap `headerChip`'s `default: return toolName` to `return argsChip(toolName, args)`. All existing result-kind arms unchanged.

## 2. Running-state preview body

- [ ] 2.1 Add `RunningPreview({ toolName, args })`: batch → `args.commands[]` as `• <label>  <command>` list; execute/execute_file → `<CodeBlock code={args.code} language={args.language}>`; search → `args.queries[]` bullet list; fetch → url link(s); default → plain `Running…`.
- [ ] 2.2 Replace the `status === "running" && !result` block's bare `Running…` with `<RunningPreview toolName={toolName} args={args} />`. Keep it inside the existing `max-h-80` scroll region.

## 3. Tests

- [ ] 3.1 Test: `ctx_batch_execute` running (`status="running"`, no result) renders chip `▦ 3 cmds` AND subtitle `ctx_batch_execute` — the two differ (regression guard for the duplication).
- [ ] 3.2 Test: `ctx_batch_execute` running lists each `args.commands[].label`.
- [ ] 3.3 Test: `ctx_execute` running with `args.language="javascript"` renders chip `⚙ javascript` and shows `args.code`.
- [ ] 3.4 Test: `ctx_search` running renders chip `🔍 2 queries` and lists both `args.queries[]`.
- [ ] 3.5 Test: result-state cards (batch/execute/search/fetch/index/error) still render unchanged — no regression from the `default`-arm swap.

## 4. Validate

- [ ] 4.1 `npm test` green (vitest, `CtxToolRenderer.test.tsx` + `parse-ctx-result.test.ts`).
- [ ] 4.2 Manual: trigger a real multi-command `ctx_batch_execute` in the running dashboard; confirm the mid-run card shows `▦ N cmds` + command list, no duplicate tool name. (Marked done at ship time.)
- [ ] 4.3 `openspec validate fix-ctx-running-render` passes.
