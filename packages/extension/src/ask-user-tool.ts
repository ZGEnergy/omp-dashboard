/**
 * Registers the ask_user tool in the bridge extension.
 *
 * Called at runtime (session_start) rather than extension load time to avoid
 * static tool-name conflicts with other extensions (e.g. pi-flows) that also
 * register ask_user. Runtime registration bypasses detectExtensionConflicts.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

export function registerAskUserTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description:
      "Ask the user a question interactively. Use this when you need clarification, confirmation, or a choice from the user before proceeding.",
    promptSnippet:
      "Ask the user interactive questions (confirm, select, multiselect, or free text input)",
    promptGuidelines: [
      "When you need to ask the user a question, ALWAYS use the ask_user tool instead of writing the question as plain text.",
      "Use method 'confirm' for yes/no questions, 'select' when offering specific choices, 'multiselect' when the user should pick multiple items from a list, and 'input' for open-ended questions.",
      "This applies to all workflows including OpenSpec, planning, and any situation where you need user input before proceeding.",
    ],
    parameters: Type.Object({
      method: StringEnum(["confirm", "select", "multiselect", "input"] as const, {
        description:
          "Type of question: confirm (yes/no), select (pick from options), multiselect (pick multiple), input (free text)",
      }),
      title: Type.String({ description: "The question to ask" }),
      message: Type.Optional(Type.String({ description: "Additional context or detailed question body (all methods)" })),
      options: Type.Optional(
        Type.Array(Type.String(), { description: "Options to choose from (for select)" }),
      ),
      placeholder: Type.Optional(Type.String({ description: "Placeholder text (for input)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      let result: unknown;

      const msgOpts = params.message ? { message: params.message } : undefined;

      switch (params.method) {
        case "confirm":
          result = await ctx.ui.confirm(params.title, params.message ?? "");
          break;
        case "select":
          result = await ctx.ui.select(params.title, params.options ?? [], msgOpts);
          break;
        case "multiselect":
          result = await (ctx.ui as any).multiselect(params.title, params.options ?? [], msgOpts);
          break;
        case "input":
          result = await ctx.ui.input(params.title, params.placeholder, msgOpts);
          break;
      }

      return {
        content: [{ type: "text", text: `User responded: ${JSON.stringify(result)}` }],
        details: { method: params.method, result },
      };
    },
  });
}
