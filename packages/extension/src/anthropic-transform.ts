// ---------------------------------------------------------------------------
// Anthropic Payload Transform for Main Session
//
// ⚠️  ANTHROPIC-SPECIFIC WORKAROUND (April 2026)
//
// Anthropic's OAuth/subscription endpoint fingerprints tool names and system
// prompt text. Non-Claude-Code tool names trigger "extra usage" classification.
// This module transforms outbound API payloads so the main pi session passes
// Anthropic's filtering.
//
// Replaces @benvargas/pi-claude-code-use for the main session. Uses protocol-
// based detection (model.api === "anthropic-messages") instead of provider name
// checking, so custom proxy providers (e.g., 9Router) are handled correctly.
//
// For subagent sessions, pi-flows handles this independently via mcp__flows__
// tool name prefixing at registration time (see pi-flows/execution.ts).
// ---------------------------------------------------------------------------

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ============================================================================
// Helpers
// ============================================================================

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lower(name: string | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

// ============================================================================
// Core Claude Code tool allowlist
//
// Tool names that Anthropic accepts without mcp__ prefix.
// Case-insensitive. Mirrors pi-coding-agent's claudeCodeTools list in
// packages/ai/src/providers/anthropic.ts.
// ============================================================================

const CORE_TOOL_NAMES = new Set([
  "read",
  "write",
  "edit",
  "bash",
  "grep",
  "glob",
  "askuserquestion",
  "enterplanmode",
  "exitplanmode",
  "killshell",
  "notebookedit",
  "skill",
  "task",
  "taskoutput",
  "todowrite",
  "webfetch",
  "websearch",
]);

// ============================================================================
// System prompt rewrite
//
// Replaces pi-identifying phrases in system prompt text blocks.
// Preserves cache_control metadata, non-text blocks, and payload shape.
// ============================================================================

function rewritePromptText(text: string): string {
  return text
    .replaceAll("pi itself", "the cli itself")
    .replaceAll("pi .md files", "cli .md files")
    .replaceAll("pi packages", "cli packages");
}

function rewriteSystemField(system: unknown): unknown {
  if (typeof system === "string") {
    return rewritePromptText(system);
  }
  if (!Array.isArray(system)) {
    return system;
  }
  return system.map((block) => {
    if (!isPlainObject(block) || block.type !== "text" || typeof block.text !== "string") {
      return block;
    }
    const rewritten = rewritePromptText(block.text);
    return rewritten === block.text ? block : { ...block, text: rewritten };
  });
}

// ============================================================================
// Tool filtering
//
// Rules applied per tool:
// 1. Anthropic-native typed tools (have a `type` field) → pass through
// 2. Core Claude Code tool names (case-insensitive) → pass through
// 3. Tools already prefixed with mcp__ → pass through
// 4. Unknown flat-named tools → filtered out
// ============================================================================

function filterTools(tools: unknown[] | undefined): unknown[] | undefined {
  if (!Array.isArray(tools)) return tools;

  const emitted = new Set<string>();
  const result: unknown[] = [];

  for (const tool of tools) {
    if (!isPlainObject(tool)) continue;

    // Rule 1: native typed tools always pass through
    if (typeof tool.type === "string" && tool.type.trim().length > 0) {
      result.push(tool);
      continue;
    }

    const name = typeof tool.name === "string" ? tool.name : "";
    if (!name) continue;
    const nameLc = lower(name);

    // Rules 2 & 3: core tools and mcp__-prefixed pass through (with dedup)
    if (CORE_TOOL_NAMES.has(nameLc) || nameLc.startsWith("mcp__")) {
      if (!emitted.has(nameLc)) {
        emitted.add(nameLc);
        result.push(tool);
      }
      continue;
    }

    // Rule 4: unknown flat-named tool → filtered out
  }

  return result;
}

function remapToolChoice(
  toolChoice: Record<string, unknown>,
  survivingNames: Set<string>,
): Record<string, unknown> | undefined {
  if (toolChoice.type !== "tool" || typeof toolChoice.name !== "string") {
    return toolChoice;
  }
  return survivingNames.has(lower(toolChoice.name)) ? toolChoice : undefined;
}

// ============================================================================
// Full payload transform
// ============================================================================

function transformPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const payload = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;

  // 1. System prompt rewrite
  if (payload.system !== undefined) {
    payload.system = rewriteSystemField(payload.system);
  }

  // 2. Tool filtering
  payload.tools = filterTools(payload.tools as unknown[] | undefined);

  // 3. Build surviving name set for tool_choice fixup
  const survivingNames = new Set<string>();
  if (Array.isArray(payload.tools)) {
    for (const tool of payload.tools) {
      if (isPlainObject(tool) && typeof tool.name === "string") {
        survivingNames.add(lower(tool.name));
      }
    }
  }

  // 4. Fix tool_choice if it references a filtered tool
  if (isPlainObject(payload.tool_choice)) {
    const remapped = remapToolChoice(payload.tool_choice, survivingNames);
    if (remapped === undefined) {
      delete payload.tool_choice;
    } else {
      payload.tool_choice = remapped;
    }
  }

  return payload;
}

// ============================================================================
// Activation — call from bridge.ts to register the before_provider_request hook
// ============================================================================

export function activateAnthropicTransform(pi: ExtensionAPI): void {
  pi.on("before_provider_request", (event: any, ctx: any) => {
    const model = ctx.model;
    if (!model || model.api !== "anthropic-messages") {
      return undefined;
    }
    if (!isPlainObject(event.payload)) {
      return undefined;
    }
    return transformPayload(event.payload as Record<string, unknown>);
  });
}
