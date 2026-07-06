/**
 * One-line human summaries for tool calls (`$ <cmd>`, `Read <path>`, …).
 *
 * Single source of truth shared by `ToolCallStep`, `CollapsedToolGroup`, and
 * `ToolBurstGroup` (the live-command chip). Previously duplicated: a rich map
 * in `ToolCallStep` and a bare `bash/read/edit/write` map in
 * `CollapsedToolGroup`, so `grep`/`git`/`glob`/`kb_search` degraded to a bare
 * tool name in the collapsed surfaces. DRY, one map. See change:
 * group-tool-call-bursts.
 */

export const toolSummaries: Record<string, (args?: Record<string, unknown>) => string> = {
  read: (args) => `Read ${args?.path ?? "file"}`,
  bash: (args) => `$ ${String(args?.command ?? "")}`,
  edit: (args) => `Edit ${args?.path ?? "file"}`,
  write: (args) => `Write ${args?.path ?? "file"}`,
  grep: (args) => `Grep ${args?.pattern ?? ""}`,
  glob: (args) => `Glob ${args?.pattern ?? args?.glob ?? ""}`.trim(),
  find: (args) => `Find ${args?.glob ?? ""}`,
  ls: (args) => `ls ${args?.path ?? "."}`,
  git: (args) => `git ${String(args?.command ?? args?.args ?? "")}`.trim(),
  kb_search: (args) => `kb_search ${String(args?.query ?? "")}`.trim(),
  ask_user: (args) => `${String(args?.title ?? "ask_user")}`,
  Agent: (args) => `${args?.subagent_type ?? "Agent"}: ${String(args?.description ?? "")}`,
  get_subagent_result: (args) => `Get result: ${String(args?.agent_id ?? "")}`,
  steer_subagent: (args) => `Steer: ${String(args?.agent_id ?? "")}`,
  ctx_execute: (args) => `ctx_execute ${String(args?.language ?? "")}`.trim(),
  ctx_execute_file: (args) => `ctx_execute_file ${String(args?.path ?? "")}`.trim(),
  ctx_batch_execute: (args) =>
    `ctx_batch_execute ${Array.isArray(args?.commands) ? `${args.commands.length} cmds` : ""}`.trim(),
  ctx_search: (args) =>
    `ctx_search ${Array.isArray(args?.queries) ? `${args.queries.length} queries` : ""}`.trim(),
  ctx_index: (args) => `ctx_index ${String(args?.source ?? args?.path ?? "")}`.trim(),
  ctx_fetch_and_index: (args) => `ctx_fetch_and_index ${String(args?.url ?? args?.source ?? "")}`.trim(),
  ctx_insight: () => `ctx_insight`,
};

export function getSummary(toolName: string, args?: Record<string, unknown>): string {
  const fn = toolSummaries[toolName];
  if (fn) return fn(args);
  return toolName;
}
