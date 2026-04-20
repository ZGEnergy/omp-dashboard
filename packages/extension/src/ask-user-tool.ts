/**
 * Registers the ask_user tool in the bridge extension.
 *
 * Called at runtime (session_start) rather than extension load time to avoid
 * static tool-name conflicts with other extensions (e.g. pi-flows) that also
 * register ask_user. Runtime registration bypasses detectExtensionConflicts.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

// ──────────────────────────────────────────────────────────────────────────
// Single-question schema arms (reused inside the batch arm's questions array)
// ──────────────────────────────────────────────────────────────────────────

const ConfirmSchema = Type.Object({
  method: Type.Literal("confirm", { description: "Yes/no question" }),
  title: Type.String({ description: "The question to confirm" }),
  message: Type.Optional(Type.String({ description: "Additional context or detailed question body" })),
});

const SelectSchema = Type.Object({
  method: Type.Literal("select", { description: "Pick one option from a list" }),
  title: Type.String({ description: "Short title for the question" }),
  options: Type.Array(Type.String(), {
    minItems: 2,
    description: "Options the user chooses between (at least 2; use 'confirm' for yes/no)",
  }),
  message: Type.Optional(Type.String({ description: "Additional context" })),
});

const MultiselectSchema = Type.Object({
  method: Type.Literal("multiselect", { description: "Pick multiple options from a list" }),
  title: Type.String({ description: "Short title for the question" }),
  options: Type.Array(Type.String(), {
    minItems: 1,
    description: "Options the user can multi-select",
  }),
  message: Type.Optional(Type.String({ description: "Additional context" })),
});

const InputSchema = Type.Object({
  method: Type.Literal("input", { description: "Free-text input" }),
  title: Type.String({ description: "Short title for the question" }),
  placeholder: Type.Optional(Type.String({ description: "Placeholder text for the input field" })),
  message: Type.Optional(Type.String({ description: "Additional context" })),
});

// Sub-question union deliberately omits the batch arm (no nesting).
const SubQuestionSchema = Type.Union([ConfirmSchema, SelectSchema, MultiselectSchema, InputSchema], {
  description: "A single question inside a batch. Must not itself be a batch.",
});

const BatchSchema = Type.Object({
  method: Type.Literal("batch", {
    description: "Ask multiple related questions in one call; answers are returned as an ordered array.",
  }),
  title: Type.String({ description: "Header shown above the sequence of dialogs" }),
  questions: Type.Array(SubQuestionSchema, {
    minItems: 1,
    description: "One or more sub-questions (confirm/select/multiselect/input). Cannot nest batch.",
  }),
  message: Type.Optional(Type.String({ description: "Additional context for the whole batch" })),
});

// ──────────────────────────────────────────────────────────────────────────
// Argument rescue helpers
// ──────────────────────────────────────────────────────────────────────────

type NormalizationWarning = string;

function normalizeSubQuestion(
  sq: unknown,
  warnings: NormalizationWarning[],
): Record<string, unknown> {
  if (!sq || typeof sq !== "object" || Array.isArray(sq)) return sq as any;
  let obj = { ...(sq as Record<string, unknown>) };

  // Flatten `input_type: {method, options, ...}` wrapper if present.
  if (obj.input_type && typeof obj.input_type === "object" && !Array.isArray(obj.input_type)) {
    const inner = obj.input_type as Record<string, unknown>;
    const { input_type: _drop, ...rest } = obj;
    obj = { ...inner, ...rest };
    delete (obj as Record<string, unknown>).input_type;
  }

  // Rename `question` / `header` → `title` (only if title missing).
  if (obj.title === undefined) {
    if (typeof obj.question === "string") obj.title = obj.question;
    else if (typeof obj.header === "string") obj.title = obj.header;
  }

  // Parse stringified options.
  if (typeof obj.options === "string") {
    try {
      const parsed = JSON.parse(obj.options);
      if (Array.isArray(parsed)) obj.options = parsed;
    } catch {
      /* leave as-is */
    }
  }

  // Convert options: [{label, value}] → [label, ...] with a warning.
  if (Array.isArray(obj.options) && obj.options.length > 0 && obj.options.every(
    (o) => o && typeof o === "object" && !Array.isArray(o) && typeof (o as any).label === "string",
  )) {
    obj.options = (obj.options as Array<Record<string, unknown>>).map((o) => o.label as string);
    warnings.push(
      "ask_user: options with {label, value} pairs are not supported — only labels were used. Send options as string[].",
    );
  }

  return obj;
}

// ──────────────────────────────────────────────────────────────────────────
// Tool registration
// ──────────────────────────────────────────────────────────────────────────

export function registerAskUserTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description:
      "Ask the user a question interactively. Use this when you need clarification, confirmation, or a choice from the user before proceeding.",
    promptSnippet:
      "Ask the user interactive questions (confirm, select, multiselect, input, or batch — multiple related questions at once)",
    promptGuidelines: [
      "When you need to ask the user a question, ALWAYS use the ask_user tool instead of writing the question as plain text.",
      "Use method 'confirm' for yes/no questions, 'select' when offering specific choices, 'multiselect' when the user should pick multiple items from a list, and 'input' for open-ended questions.",
      "Use method 'batch' with a `questions` array to ask multiple related questions in one call (e.g. project setup: name + language + init git). Prefer single-method calls for standalone questions.",
      "Do not nest batches. Send `options` as a plain string[] — not [{label, value}].",
      "This applies to all workflows including OpenSpec, planning, and any situation where you need user input before proceeding.",
    ],
    parameters: Type.Union(
      [ConfirmSchema, SelectSchema, MultiselectSchema, InputSchema, BatchSchema],
      { description: "Parameters for ask_user, discriminated by method." },
    ),
    prepareArguments(args: unknown) {
      let obj = (args && typeof args === "object" ? { ...(args as Record<string, unknown>) } : {}) as Record<string, unknown>;

      // 1. LLMs sometimes wrap everything under `params` (stringified or object).
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
          const { params: _omit, ...rest } = obj;
          obj = { ...inner, ...rest };
          delete (obj as Record<string, unknown>).params;
        }
      }

      // 2. `question` → `title` (only if title missing).
      if (obj.title === undefined && typeof obj.question === "string") {
        obj.title = obj.question;
      }

      // 3. Stringified top-level `options` for single-method calls.
      if (typeof obj.options === "string") {
        try {
          const parsed = JSON.parse(obj.options);
          if (Array.isArray(parsed)) obj.options = parsed;
        } catch { /* leave as-is */ }
      }

      // 4. Batch rescue: `questions` as a JSON string → parsed array.
      if (typeof obj.questions === "string") {
        try {
          const parsed = JSON.parse(obj.questions);
          if (Array.isArray(parsed)) obj.questions = parsed;
        } catch { /* leave as-is */ }
      }

      // 5. If `questions` is a non-empty array and `method` is absent, synthesize `method: "batch"`.
      if (
        !obj.method &&
        Array.isArray(obj.questions) &&
        obj.questions.length > 0
      ) {
        obj.method = "batch";
      }

      // 6. For any batch call (synthesized or explicit), backfill a missing outer `title`
      //    from the first sub-question so the schema validates. Opus frequently sends
      //    `{method:"batch", questions:[...]}` without an outer `title`.
      if (
        obj.method === "batch" &&
        Array.isArray(obj.questions) &&
        obj.questions.length > 0 &&
        obj.title === undefined
      ) {
        const first = obj.questions[0] as Record<string, unknown> | undefined;
        const candidate =
          (first && (first.title ?? first.question ?? first.header)) || "Questions";
        obj.title = typeof candidate === "string" ? candidate : "Questions";
      }

      // 7. For batch calls, normalize each sub-question (input_type, question/header, {label,value}).
      const warnings: NormalizationWarning[] = [];
      if (obj.method === "batch" && Array.isArray(obj.questions)) {
        obj.questions = obj.questions.map((sq) => normalizeSubQuestion(sq, warnings));
      }

      if (warnings.length > 0) {
        // Non-enumerable so it doesn't interfere with schema validation.
        Object.defineProperty(obj, "__normalizations", {
          value: warnings,
          enumerable: false,
          configurable: true,
          writable: true,
        });
      }

      return obj as any;
    },
    async execute(_toolCallId: any, params: any, _signal: any, _onUpdate: any, ctx: any) {
      // ── Batch branch ─────────────────────────────────────────────────
      if (params.method === "batch" && Array.isArray(params.questions)) {
        const results: Array<unknown> = [];
        let cancelled = false;

        for (const sq of params.questions) {
          const subTitle = `${params.title} — ${sq.title ?? "Question"}`;
          const subMsg = params.message ? { message: params.message } : undefined;

          let answer: unknown;
          try {
            switch (sq.method) {
              case "confirm":
                answer = await ctx.ui.confirm(subTitle, sq.message ?? params.message ?? "");
                break;
              case "select": {
                const opts = Array.isArray(sq.options) ? sq.options : [];
                if (opts.length === 0) {
                  throw new Error(
                    `ask_user batch: sub-question method "select" requires a non-empty "options" array.`,
                  );
                }
                answer = await ctx.ui.select(subTitle, opts, subMsg);
                break;
              }
              case "multiselect": {
                const opts = Array.isArray(sq.options) ? sq.options : [];
                if (opts.length === 0) {
                  throw new Error(
                    `ask_user batch: sub-question method "multiselect" requires a non-empty "options" array.`,
                  );
                }
                answer = await (ctx.ui as any).multiselect(subTitle, opts, subMsg);
                break;
              }
              case "input":
                answer = await ctx.ui.input(subTitle, sq.placeholder, subMsg);
                break;
              default:
                throw new Error(`ask_user batch: unknown sub-question method "${sq.method}"`);
            }
          } catch (err) {
            // Propagate hard errors (schema/logic bugs); cancellation is signalled by undefined.
            throw err;
          }

          // Treat `undefined` from input/select/multiselect as cancellation.
          // (confirm always resolves to a boolean and has no cancel path.)
          if (
            (sq.method === "input" || sq.method === "select" || sq.method === "multiselect") &&
            answer === undefined
          ) {
            cancelled = true;
            results.push(null);
            break;
          }

          results.push(answer);
        }

        const warnings: string[] = (params as any).__normalizations ?? [];
        const lines: string[] = [];
        if (cancelled) {
          lines.push(`User cancelled batch after ${results.filter((r) => r !== null).length} of ${params.questions.length} answers.`);
        } else {
          lines.push(`User completed batch (${results.length} answers).`);
        }
        params.questions.forEach((sq: any, i: number) => {
          const ans = i < results.length ? results[i] : "(not asked)";
          lines.push(`  ${i + 1}. ${sq.title ?? sq.method}: ${JSON.stringify(ans)}`);
        });
        if (warnings.length > 0) {
          lines.push("", "Warnings:");
          for (const w of warnings) lines.push(`  - ${w}`);
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: {
            method: "batch",
            results,
            cancelled,
            warnings,
          },
        };
      }

      // ── Single-question branches (unchanged behavior) ────────────────
      let result: unknown;
      const msgOpts = params.message ? { message: params.message } : undefined;
      const title = params.title || params.message || "Question";

      const options: string[] = Array.isArray(params.options)
        ? params.options
        : typeof params.options === "string"
          ? (() => { try { const p = JSON.parse(params.options); return Array.isArray(p) ? p : []; } catch { return []; } })()
          : [];

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
