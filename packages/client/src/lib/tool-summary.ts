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

import {
  mdiAccountGroupOutline,
  mdiAccountQuestionOutline,
  mdiBrain,
  mdiCheckCircleOutline,
  mdiCloseCircleOutline,
  mdiCodeBraces,
  mdiConsoleLine,
  mdiDatabasePlusOutline,
  mdiDatabaseSearchOutline,
  mdiDownload,
  mdiFileDocumentEditOutline,
  mdiFileDocumentOutline,
  mdiFilePlusOutline,
  mdiFlagOutline,
  mdiFolderSearchOutline,
  mdiFormatListBulleted,
  mdiFormatListCheckbox,
  mdiGithub,
  mdiImageOutline,
  mdiImagePlusOutline,
  mdiLightbulbOutline,
  mdiMagnify,
  mdiPencil,
  mdiRobotOutline,
  mdiSourceBranch,
  mdiWeb,
  mdiWrenchOutline,
} from "@mdi/js";
import { t } from "./i18n";

export const toolSummaries: Record<string, (args?: Record<string, unknown>) => string> = {
  read: (args) => `Read ${args?.path ?? t("common.file", undefined, "file")}`,
  bash: (args) => `$ ${String(args?.command ?? "")}`,
  edit: (args) => `Edit ${args?.path ?? t("common.file", undefined, "file")}`,
  write: (args) => `Write ${args?.path ?? t("common.file", undefined, "file")}`,
  grep: (args) => `Grep ${args?.pattern ?? ""}`,
  glob: (args) => `Glob ${args?.pattern ?? args?.glob ?? ""}`.trim(),
  find: (args) => `Find ${args?.glob ?? ""}`,
  ls: (args) => `ls ${args?.path ?? "."}`,
  git: (args) => `git ${String(args?.command ?? args?.args ?? "")}`.trim(),
  kb_search: (args) => `kb_search ${String(args?.query ?? "")}`.trim(),
  ask_user: (args) => `${String(args?.title ?? "ask_user")}`,
  ask: (args) => `${String(args?.title ?? args?.question ?? "ask")}`,
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
  resolve: (args) => `Resolve ${args?.reason ? String(args.reason) : args?.label ? String(args.label) : ""}`.trim(),
  reject: (args) => `Reject ${args?.reason ? String(args.reason) : args?.label ? String(args.label) : ""}`.trim(),
  eval: (args) => `eval ${args?.language ? `${args.language} ` : ""}${args?.title ? `(${args.title})` : ""}`.trim(),
  browser: (args) => `browser ${args?.action ?? args?.url ?? ""}`.trim(),
  task: (args) => `task ${args?.name ?? args?.agent ?? ""}`.trim(),
  hub: (args) => `hub ${args?.op ?? args?.to ?? ""}`.trim(),
  todo: (args) => `todo ${args?.action ?? ""}`.trim(),
  goal: (args) => `goal ${args?.objective ?? args?.goal ?? ""}`.trim(),
  think: (args) => `think ${args?.thought ? String(args.thought).slice(0, 40) : ""}`.trim(),
  ast_edit: (args) => `ast_edit ${args?.path ?? ""}`.trim(),
  ast_grep: (args) => `ast_grep ${args?.pattern ?? args?.path ?? ""}`.trim(),
  lsp: (args) => `lsp ${args?.command ?? args?.action ?? ""}`.trim(),
  web_search: (args) => `web_search ${args?.query ?? ""}`.trim(),
  fetch: (args) => `fetch ${args?.url ?? args?.path ?? ""}`.trim(),
  github: (args) => `github ${args?.op ?? args?.action ?? ""}`.trim(),
  apply_patch: (args) => `apply_patch ${args?.path ?? ""}`.trim(),
  retain: (args) => `retain ${args?.key ?? args?.topic ?? ""}`.trim(),
  recall: (args) => `recall ${args?.query ?? args?.key ?? ""}`.trim(),
  reflect: (args) => `reflect ${args?.topic ?? ""}`.trim(),
  inspect_image: (args) => `inspect_image ${args?.path ?? args?.url ?? ""}`.trim(),
  generate_image: (args) => `generate_image ${args?.prompt ? String(args.prompt).slice(0, 30) : ""}`.trim(),
};

export function getSummary(toolName: string, args?: Record<string, unknown>): string {
  const fn = toolSummaries[toolName];
  if (fn) return fn(args);
  return toolName;
}

/**
 * `toolName → mdi icon path` for the per-kind breakdown chips + single-member
 * header glyph. Unknown kinds fall back to a generic wrench. Keys mirror the
 * `toolSummaries` map above (same tool-name space). See change:
 * enhance-tool-call-grouping.
 */
export const toolIcons: Record<string, string> = {
  read: mdiFileDocumentOutline,
  bash: mdiConsoleLine,
  edit: mdiPencil,
  write: mdiFilePlusOutline,
  grep: mdiMagnify,
  glob: mdiFolderSearchOutline,
  find: mdiFolderSearchOutline,
  ls: mdiFolderSearchOutline,
  git: mdiSourceBranch,
  kb_search: mdiDatabaseSearchOutline,
  ask_user: mdiAccountQuestionOutline,
  ask: mdiAccountQuestionOutline,
  Agent: mdiRobotOutline,
  get_subagent_result: mdiRobotOutline,
  steer_subagent: mdiRobotOutline,
  ctx_execute: mdiCodeBraces,
  ctx_execute_file: mdiCodeBraces,
  ctx_batch_execute: mdiCodeBraces,
  ctx_search: mdiDatabaseSearchOutline,
  ctx_index: mdiDatabaseSearchOutline,
  ctx_fetch_and_index: mdiWeb,
  ctx_insight: mdiFormatListBulleted,
  resolve: mdiCheckCircleOutline,
  reject: mdiCloseCircleOutline,
  eval: mdiCodeBraces,
  browser: mdiWeb,
  task: mdiFormatListCheckbox,
  hub: mdiAccountGroupOutline,
  todo: mdiFormatListCheckbox,
  goal: mdiFlagOutline,
  think: mdiBrain,
  ast_edit: mdiFileDocumentEditOutline,
  ast_grep: mdiMagnify,
  lsp: mdiCodeBraces,
  web_search: mdiWeb,
  fetch: mdiDownload,
  github: mdiGithub,
  apply_patch: mdiPencil,
  retain: mdiDatabasePlusOutline,
  recall: mdiDatabaseSearchOutline,
  reflect: mdiLightbulbOutline,
  inspect_image: mdiImageOutline,
  generate_image: mdiImagePlusOutline,
};

/** mdi icon path for a tool kind; generic wrench for unknown kinds. */
export function getToolIcon(toolName: string): string {
  return toolIcons[toolName] ?? mdiWrenchOutline;
}
