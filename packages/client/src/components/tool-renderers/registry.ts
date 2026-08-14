import { AgentToolRenderer } from "./AgentToolRenderer.js";
import { AskUserToolRenderer } from "./AskUserToolRenderer.js";
import { AstToolRenderer } from "./AstToolRenderer.js";
import { BashToolRenderer } from "./BashToolRenderer.js";
import { BrowserToolRenderer } from "./BrowserToolRenderer.js";
import { CtxToolRenderer } from "./CtxToolRenderer.js";
import { EditToolRenderer } from "./EditToolRenderer.js";
import { EvalToolRenderer } from "./EvalToolRenderer.js";
import { GenericToolRenderer } from "./GenericToolRenderer.js";
import { GithubToolRenderer } from "./GithubToolRenderer.js";
import { GoalToolRenderer } from "./GoalToolRenderer.js";
import { HubToolRenderer } from "./HubToolRenderer.js";
import { ImageToolRenderer } from "./ImageToolRenderer.js";
import { KnowledgeToolRenderer } from "./KnowledgeToolRenderer.js";
import { LspToolRenderer } from "./LspToolRenderer.js";
import { ReadToolRenderer } from "./ReadToolRenderer.js";
import { ResolveRejectToolRenderer } from "./ResolveRejectToolRenderer.js";
import { SearchToolRenderer } from "./SearchToolRenderer.js";
import { TaskToolRenderer } from "./TaskToolRenderer.js";
import { ThinkToolRenderer } from "./ThinkToolRenderer.js";
import { TodoToolRenderer } from "./TodoToolRenderer.js";
import type { ToolRenderer } from "./types.js";
import { WriteToolRenderer } from "./WriteToolRenderer.js";

const renderers = new Map<string, ToolRenderer>([
  ["read", ReadToolRenderer],
  ["edit", EditToolRenderer],
  ["write", WriteToolRenderer],
  ["bash", BashToolRenderer],
  ["Agent", AgentToolRenderer],
  ["ask_user", AskUserToolRenderer],
  ["ask", AskUserToolRenderer],
  ["ctx_execute", CtxToolRenderer],
  ["ctx_execute_file", CtxToolRenderer],
  ["ctx_batch_execute", CtxToolRenderer],
  ["ctx_search", CtxToolRenderer],
  ["ctx_index", CtxToolRenderer],
  ["ctx_fetch_and_index", CtxToolRenderer],
  ["ctx_insight", CtxToolRenderer],
  // Specable Tool Card Mappings (#120)
  ["apply_patch", EditToolRenderer],
  ["fetch", ReadToolRenderer],
  ["resolve", ResolveRejectToolRenderer],
  ["reject", ResolveRejectToolRenderer],
  ["eval", EvalToolRenderer],
  ["browser", BrowserToolRenderer],
  ["task", TaskToolRenderer],
  ["hub", HubToolRenderer],
  ["todo", TodoToolRenderer],
  ["goal", GoalToolRenderer],
  ["think", ThinkToolRenderer],
  ["ast_edit", AstToolRenderer],
  ["ast_grep", AstToolRenderer],
  ["lsp", LspToolRenderer],
  ["web_search", SearchToolRenderer],
  ["grep", SearchToolRenderer],
  ["glob", SearchToolRenderer],
  ["find", SearchToolRenderer],
  ["github", GithubToolRenderer],
  ["retain", KnowledgeToolRenderer],
  ["recall", KnowledgeToolRenderer],
  ["reflect", KnowledgeToolRenderer],
  ["inspect_image", ImageToolRenderer],
  ["generate_image", ImageToolRenderer],
]);

/** Register a custom renderer for a tool name */
export function registerToolRenderer(toolName: string, renderer: ToolRenderer): void {
  renderers.set(toolName, renderer);
}

/**
 * Get the renderer for a tool, falling back to GenericToolRenderer.
 *
 * Any unmapped tool whose name begins with `ctx_` routes to `CtxToolRenderer`
 * (rendered as a raw card) so new context-mode tools (`ctx_stats`, `ctx_doctor`,
 * `ctx_purge`, …) need no code change. See change: add-ctx-tool-renderer (Decision 4).
 */
export function getToolRenderer(toolName: string): ToolRenderer {
  const mapped = renderers.get(toolName);
  if (mapped) return mapped;
  if (toolName.startsWith("ctx_")) return CtxToolRenderer;
  return GenericToolRenderer;
}
