/**
 * Registers an OMP-core-named `ask` tool on dashboard headless sessions.
 *
 * Why: OMP's built-in `AskTool.createIf` is create-time gated on
 * `session.hasUI`. Dashboard spawns `pi --mode rpc` with hasUI=false, so core
 * `ask` never enters the tool registry. `setToolUIContext` / `flipHasUI` only
 * affect execute-time context — they cannot resurrect a tool that was never
 * created. This bridge registration re-exposes the Claude Code–analogue tool
 * name and routes execute through the already-patched `ctx.ui.*` → PromptBus
 * path (same surface as `ask_user`).
 *
 * Schema is a flat Type.Object (OpenAI strict-mode friendly), matching the
 * shape models already emit for core `ask`: `{ questions: [{ id, question,
 * options[{label}], multi?, recommended? }] }`.
 *
 * Registered by `bridge.ts` at extension factory load, before `createAgentSession` snapshots the tool registry. Headless sessions (`hasUI=false`) omit stock core creation, so this is the sole bridge registration; it is not deferred to `session_start`.
 * Execution uses the PromptBus-patched `ctx.ui.*` methods. TUI sessions retain the PromptBus TUI adapter while dashboard sessions use the default dashboard adapter.
 * See change: add-server-push-notifications (CC ask parity path).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { polyfillMultiselect } from "./multiselect-polyfill.js";

const OptionSchema = Type.Object({
  label: Type.String({ description: "display label" }),
  description: Type.Optional(Type.String({ description: "optional explanatory text" })),
});

const QuestionSchema = Type.Object({
  id: Type.String({ description: "question id" }),
  question: Type.String({ description: "question text" }),
  header: Type.Optional(Type.String({ description: "optional short display chip" })),
  options: Type.Array(OptionSchema, { description: "available options" }),
  multi: Type.Optional(Type.Boolean({ description: "allow multiple selections" })),
  recommended: Type.Optional(Type.Number({ description: "recommended option index" })),
});

interface AskOption {
  label: string;
  description?: string;
}

interface AskQuestion {
  id: string;
  question: string;
  header?: string;
  options: AskOption[];
  multi?: boolean;
  recommended?: number;
}

interface AskParams {
  questions: AskQuestion[];
}

interface UiCtx {
  ui: {
    select?: (
      title: string,
      options: string[],
      opts?: Record<string, unknown>,
    ) => Promise<string | undefined>;
    input?: (
      title: string,
      placeholder?: string,
      opts?: Record<string, unknown>,
    ) => Promise<string | undefined>;
    multiselect?: (
      title: string,
      options: string[],
      opts?: Record<string, unknown>,
    ) => Promise<string[] | undefined>;
    batch?: (
      title: string,
      questions: Array<Record<string, unknown>>,
      opts?: Record<string, unknown>,
    ) => Promise<unknown[] | undefined>;
    custom?: (...args: unknown[]) => Promise<unknown>;
  };
}

function optionLabels(options: AskOption[] | undefined): string[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) => (o && typeof o.label === "string" ? o.label : ""))
    .filter((l) => l.length > 0);
}

function asAskParams(raw: unknown): AskParams {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const questionsRaw = Array.isArray(obj.questions) ? obj.questions : [];
  const questions: AskQuestion[] = questionsRaw
    .filter((q): q is Record<string, unknown> => !!q && typeof q === "object")
    .map((q, i) => {
      const optionsRaw = Array.isArray(q.options) ? q.options : [];
      const options: AskOption[] = optionsRaw
        .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
        .map((o) => ({
          label: typeof o.label === "string" ? o.label : String(o.label ?? ""),
          ...(typeof o.description === "string" ? { description: o.description } : {}),
        }))
        .filter((o) => o.label.length > 0);
      return {
        id: typeof q.id === "string" && q.id.length > 0 ? q.id : `q${i + 1}`,
        question: typeof q.question === "string" ? q.question : String(q.question ?? "Question"),
        ...(typeof q.header === "string" ? { header: q.header } : {}),
        options,
        ...(typeof q.multi === "boolean" ? { multi: q.multi } : {}),
        ...(typeof q.recommended === "number" ? { recommended: q.recommended } : {}),
      };
    });
  return { questions };
}

function methodForQuestion(q: AskQuestion): "select" | "multiselect" | "input" {
  if (q.multi) return "multiselect";
  if (q.options.length > 0) return "select";
  return "input";
}

function selectedFromAnswer(answer: unknown, multi: boolean): {
  selectedOptions: string[];
  customInput?: string;
  cancelled: boolean;
} {
  if (answer === undefined || answer === null) {
    return { selectedOptions: [], cancelled: true };
  }
  if (multi) {
    if (Array.isArray(answer)) {
      return {
        selectedOptions: answer.map((v) => String(v)),
        cancelled: false,
      };
    }
    if (typeof answer === "object" && answer !== null && "values" in answer) {
      const values = (answer as { values: unknown }).values;
      if (Array.isArray(values)) {
        return { selectedOptions: values.map((v) => String(v)), cancelled: false };
      }
    }
    return { selectedOptions: [String(answer)], cancelled: false };
  }
  if (typeof answer === "object" && answer !== null) {
    if ("value" in answer) {
      const value = String((answer as { value: unknown }).value ?? "");
      return { selectedOptions: [value], customInput: value, cancelled: false };
    }
    if ("confirmed" in answer) {
      const confirmed = Boolean((answer as { confirmed: unknown }).confirmed);
      return { selectedOptions: [confirmed ? "yes" : "no"], cancelled: false };
    }
  }
  const text = String(answer);
  return { selectedOptions: [text], customInput: text, cancelled: false };
}

async function presentOne(
  ctx: UiCtx,
  q: AskQuestion,
  opts: Record<string, unknown> | undefined,
): Promise<unknown> {
  const title = q.header ?? q.question;
  const labels = optionLabels(q.options);
  const method = methodForQuestion(q);
  if (method === "multiselect") {
    return polyfillMultiselect(
      ctx as unknown as Parameters<typeof polyfillMultiselect>[0],
      title,
      labels,
      opts,
    );
  }
  if (method === "select") {
    if (!ctx.ui.select) throw new Error("ask: ctx.ui.select is unavailable");
    return ctx.ui.select(title, labels, opts);
  }
  if (!ctx.ui.input) throw new Error("ask: ctx.ui.input is unavailable");
  return ctx.ui.input(title, undefined, opts);
}

export function registerAskTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ask",
    label: "Ask",
    description:
      "Ask the user interactive questions during execution (OMP core tool name). Prefer structured options when possible. On the dashboard this routes through the same prompt bus as ask_user.",
    promptSnippet: "Ask the user questions with structured options (core ask)",
    promptGuidelines: [
      "Use `ask` when you need the user to answer one or more structured questions before continuing.",
      "Pass `questions` as an array of { id, question, options:[{label}], multi?, recommended? }.",
      "On the dashboard PWA, `ask` and `ask_user` both block for user input and surface as needs-you / push.",
    ],
    parameters: Type.Object(
      {
        questions: Type.Array(QuestionSchema, {
          minItems: 1,
          description: "One or more questions to present to the user",
        }),
      },
      {
        description:
          "Core-compatible ask parameters. Each question needs id + question; options may be empty for free-text.",
      },
    ),
    prepareArguments(args: unknown) {
      return asAskParams(args);
    },
    async execute(
      toolCallId: unknown,
      rawParams: unknown,
      _signal: unknown,
      _onUpdate: unknown,
      ctx: unknown,
    ) {
      const params = asAskParams(rawParams);
      if (params.questions.length === 0) {
        throw new Error("ask: questions must be a non-empty array");
      }
      const uiCtx = ctx as UiCtx;
      const tcid =
        typeof toolCallId === "string" && toolCallId.length > 0 ? toolCallId : undefined;
      const withTcid = (opts?: Record<string, unknown>): Record<string, unknown> | undefined => {
        if (!tcid) return opts;
        return { ...(opts ?? {}), toolCallId: tcid };
      };

      // Multi-question → one batch request when the bridge exposes ui.batch.
      if (params.questions.length > 1 && typeof uiCtx.ui.batch === "function") {
        const batchQuestions = params.questions.map((q) => {
          const method = methodForQuestion(q);
          return {
            method,
            title: q.header ?? q.question,
            message: q.question,
            options: method === "input" ? undefined : optionLabels(q.options),
          };
        });
        const answers = await uiCtx.ui.batch(
          params.questions[0]?.header ?? "Questions",
          batchQuestions,
          withTcid({ message: params.questions.map((q) => q.question).join("\n") }),
        );
        const cancelled = answers === undefined;
        const results = params.questions.map((q, i) => {
          const answer = !cancelled && Array.isArray(answers) ? answers[i] : undefined;
          const parsed = selectedFromAnswer(answer, Boolean(q.multi));
          return {
            id: q.id,
            question: q.question,
            options: optionLabels(q.options),
            multi: Boolean(q.multi),
            selectedOptions: parsed.selectedOptions,
            ...(parsed.customInput !== undefined ? { customInput: parsed.customInput } : {}),
            ...(parsed.cancelled ? { cancelled: true } : {}),
          };
        });
        const lines = cancelled
          ? [`User cancelled ask batch (0 of ${params.questions.length} answers).`]
          : [`User completed ask batch (${results.length} answers).`];
        for (const r of results) {
          lines.push(`  ${r.id}: ${JSON.stringify(r.selectedOptions)}`);
        }
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { results, cancelled },
        };
      }

      // Single question (or batch unavailable) — sequential PromptBus prompts.
      const results: Array<Record<string, unknown>> = [];
      for (const q of params.questions) {
        const answer = await presentOne(uiCtx, q, withTcid({ message: q.question }));
        const parsed = selectedFromAnswer(answer, Boolean(q.multi));
        results.push({
          id: q.id,
          question: q.question,
          options: optionLabels(q.options),
          multi: Boolean(q.multi),
          selectedOptions: parsed.selectedOptions,
          ...(parsed.customInput !== undefined ? { customInput: parsed.customInput } : {}),
          ...(parsed.cancelled ? { cancelled: true } : {}),
        });
        if (parsed.cancelled) break;
      }

      const cancelled = results.some((r) => r.cancelled === true);
      const lines = results.map(
        (r) => `${String(r.id)}: ${JSON.stringify(r.selectedOptions ?? [])}`,
      );
      return {
        content: [
          {
            type: "text",
            text: cancelled
              ? `User cancelled ask.\n${lines.join("\n")}`
              : `User answered ask.\n${lines.join("\n")}`,
          },
        ],
        details: {
          ...(results.length === 1
            ? {
                question: String(results[0]?.question ?? ""),
                options: (results[0]?.options as string[] | undefined) ?? [],
                multi: Boolean(results[0]?.multi),
                selectedOptions: (results[0]?.selectedOptions as string[] | undefined) ?? [],
                ...(typeof results[0]?.customInput === "string"
                  ? { customInput: results[0].customInput }
                  : {}),
              }
            : {}),
          results,
          cancelled,
        },
      };
    },
  });
}
