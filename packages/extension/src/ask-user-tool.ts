/**
 * Registers the ask_user tool in the bridge extension.
 *
 * Called at runtime (session_start) rather than extension load time to avoid
 * static tool-name conflicts with other extensions (e.g. pi-flows) that also
 * register ask_user. Runtime registration bypasses detectExtensionConflicts.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

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
    parameters: Type.Union(
      [
        Type.Object({
          method: Type.Literal("confirm", { description: "Yes/no question" }),
          title: Type.String({ description: "The question to confirm" }),
          message: Type.Optional(Type.String({ description: "Additional context or detailed question body" })),
        }),
        Type.Object({
          method: Type.Literal("select", { description: "Pick one option from a list" }),
          title: Type.String({ description: "Short title for the question" }),
          options: Type.Array(Type.String(), {
            minItems: 2,
            description: "Options the user chooses between (at least 2; use 'confirm' for yes/no)",
          }),
          message: Type.Optional(Type.String({ description: "Additional context" })),
        }),
        Type.Object({
          method: Type.Literal("multiselect", { description: "Pick multiple options from a list" }),
          title: Type.String({ description: "Short title for the question" }),
          options: Type.Array(Type.String(), {
            minItems: 1,
            description: "Options the user can multi-select",
          }),
          message: Type.Optional(Type.String({ description: "Additional context" })),
        }),
        Type.Object({
          method: Type.Literal("input", { description: "Free-text input" }),
          title: Type.String({ description: "Short title for the question" }),
          placeholder: Type.Optional(Type.String({ description: "Placeholder text for the input field" })),
          message: Type.Optional(Type.String({ description: "Additional context" })),
        }),
      ],
      { description: "Parameters for ask_user, discriminated by method." },
    ),
    prepareArguments(args: unknown) {
      let obj = (args && typeof args === "object" ? { ...(args as Record<string, unknown>) } : {}) as Record<string, unknown>;

      // 1. LLMs sometimes wrap everything under `params` (stringified or object).
      //    Unwrap so top-level fields like title/options become available for validation.
      if (obj.params !== undefined) {
        let inner: Record<string, unknown> | undefined;
        if (typeof obj.params === "string") {
          try {
            const parsed = JSON.parse(obj.params);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              inner = parsed as Record<string, unknown>;
            }
          } catch { /* leave as-is */ }
        } else if (obj.params && typeof obj.params === "object" && !Array.isArray(obj.params)) {
          inner = obj.params as Record<string, unknown>;
        }
        if (inner) {
          // Merge inner under existing top-level values (top-level wins).
          const { params: _omit, ...rest } = obj;
          obj = { ...inner, ...rest };
          delete (obj as Record<string, unknown>).params;
        }
      }

      // 2. LLMs sometimes use `question` instead of `title`.
      if (obj.title === undefined && typeof obj.question === "string") {
        obj.title = obj.question;
      }

      // 3. LLMs sometimes send options as a JSON string instead of an array.
      if (typeof obj.options === "string") {
        try {
          const parsed = JSON.parse(obj.options);
          if (Array.isArray(parsed)) obj.options = parsed;
        } catch { /* leave as-is, validation will report */ }
      }

      return obj as any;
    },
    async execute(_toolCallId: any, params: any, _signal: any, _onUpdate: any, ctx: any) {
      let result: unknown;

      const msgOpts = params.message ? { message: params.message } : undefined;

      const title = params.title || params.message || "Question";

      // LLMs sometimes send options as a JSON string instead of an array
      const options: string[] = Array.isArray(params.options)
        ? params.options
        : typeof params.options === "string"
          ? (() => { try { const p = JSON.parse(params.options); return Array.isArray(p) ? p : []; } catch { return []; } })()
          : [];

      // Defense-in-depth: even if schema validation was bypassed, refuse to render
      // an unusable dialog. A clear error reaches the LLM so it can correct itself.
      if ((params.method === "select" || params.method === "multiselect") && options.length === 0) {
        throw new Error(
          `ask_user: method "${params.method}" requires a non-empty "options" array. ` +
          `Received: ${JSON.stringify(params.options)}. ` +
          `If no choices are available, use method "input" instead.`,
        );
      }

      switch (params.method) {
        case "confirm":
          result = await ctx.ui.confirm(title, params.message ?? "");
          break;
        case "select":
          result = await ctx.ui.select(title, options, msgOpts);
          break;
        case "multiselect":
          result = await (ctx.ui as any).multiselect(title, options, msgOpts);
          break;
        case "input":
          result = await ctx.ui.input(title, params.placeholder, msgOpts);
          break;
      }

      return {
        content: [{ type: "text", text: `User responded: ${JSON.stringify(result)}` }],
        details: { method: params.method, result },
      };
    },
  });
}
