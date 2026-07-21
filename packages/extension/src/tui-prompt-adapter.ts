import type {
  PromptAdapter,
  PromptBus,
  PromptRequest,
  PromptResponse,
} from "./prompt-bus.js";

export interface TuiPromptUi {
  select?: (
    question: string,
    options: string[],
    extra?: { signal?: AbortSignal },
  ) => Promise<string | undefined>;
  input?: (
    question: string,
    placeholder?: string,
    extra?: { signal?: AbortSignal },
  ) => Promise<string | undefined>;
  confirm?: (
    question: string,
    message: string,
    extra?: { signal?: AbortSignal },
  ) => Promise<boolean>;
  editor?: (
    question: string,
    prefill?: string,
    extra?: { signal?: AbortSignal },
  ) => Promise<string | undefined>;
}

function promptMessage(prompt: PromptRequest): string {
  return typeof prompt.metadata?.message === "string"
    ? prompt.metadata.message
    : "";
}

/** Create the PromptBus adapter that presents supported prompts in Pi's TUI. */
export function createTuiPromptAdapter(
  ui: TuiPromptUi,
  bus: Pick<PromptBus, "respond">,
): PromptAdapter {
  const activeControllers = new Map<string, AbortController>();

  return {
    name: "tui",

    onRequest(prompt) {
      const controller = new AbortController();
      activeControllers.set(prompt.id, controller);

      const present = async (): Promise<void> => {
        try {
          let answer: string | boolean | undefined;

          if (prompt.type === "select" && prompt.options && ui.select) {
            answer = await ui.select(prompt.question, prompt.options, {
              signal: controller.signal,
            });
          } else if (prompt.type === "input" && ui.input) {
            answer = await ui.input(
              prompt.question,
              prompt.defaultValue || "",
              { signal: controller.signal },
            );
          } else if (prompt.type === "confirm" && ui.confirm) {
            answer = await ui.confirm(prompt.question, promptMessage(prompt), {
              signal: controller.signal,
            });
          } else if (prompt.type === "editor" && ui.editor) {
            answer = await ui.editor(
              prompt.question,
              prompt.defaultValue || "",
              { signal: controller.signal },
            );
          } else if (prompt.type === "batch") {
            // OMP batch prompts run sequentially in TUI; dashboard remains first-response-wins peer.
            const questions = Array.isArray(prompt.metadata?.questions)
              ? (prompt.metadata.questions as Array<Record<string, unknown>>)
              : [];
            const answers: Array<Record<string, unknown>> = [];
            let cancelled = questions.length === 0;
            for (const question of questions) {
              if (controller.signal.aborted) { cancelled = true; break; }
              const method = typeof question.method === "string" ? question.method : "select";
              const title =
                (typeof question.title === "string" && question.title) ||
                (typeof question.message === "string" && question.message) ||
                (typeof question.question === "string" && question.question) ||
                "Question";
              const rawOptions = Array.isArray(question.options) ? question.options : [];
              const options = rawOptions
                .map((option) =>
                  typeof option === "string"
                    ? option
                    : String(option && typeof option === "object" && "label" in option
                      ? (option as { label: unknown }).label
                      : (option ?? "")),
                )
                .filter((label) => label.length > 0);
              if (method === "confirm" && ui.confirm) {
                const confirmed = await ui.confirm(title, "", { signal: controller.signal });
                if (controller.signal.aborted) { cancelled = true; break; }
                answers.push({ value: confirmed ? "true" : "false", confirmed });
                continue;
              }
              if ((method === "input" || options.length === 0) && ui.input) {
                const value = await ui.input(title, typeof question.placeholder === "string" ? question.placeholder : "", { signal: controller.signal });
                if (value === undefined || controller.signal.aborted) { cancelled = true; break; }
                answers.push({ value });
                continue;
              }
              if (ui.select && options.length > 0) {
                const value = await ui.select(title, options, { signal: controller.signal });
                if (value === undefined || controller.signal.aborted) { cancelled = true; break; }
                answers.push(method === "multiselect" ? { values: [value] } : { value });
                continue;
              }
              cancelled = true;
              break;
            }
            if (!controller.signal.aborted) {
              bus.respond(cancelled
                ? { id: prompt.id, cancelled: true, source: "tui" }
                : { id: prompt.id, answer: JSON.stringify(answers), cancelled: false, source: "tui" });
            }
            return;
          } else {
            // There is intentionally no multiselect arm. Pi 0.70 RPC mode's
            // ctx.ui.custom is a no-op and would auto-cancel the dashboard UI.
            return;
          }

          if (!controller.signal.aborted) {
            const answerString = typeof answer === "boolean"
              ? (answer ? "true" : "false")
              : answer;
            bus.respond({
              id: prompt.id,
              answer: answerString ?? undefined,
              cancelled: answerString == null,
              source: "tui",
            });
          }
        } catch {
          if (!controller.signal.aborted) {
            bus.respond({ id: prompt.id, cancelled: true, source: "tui" });
          }
        } finally {
          activeControllers.delete(prompt.id);
        }
      };

      void present();
      return {};
    },

    onResponse(response: PromptResponse) {
      if (response.source !== "tui") {
        const controller = activeControllers.get(response.id);
        if (controller) {
          controller.abort();
          activeControllers.delete(response.id);
        }
      }
    },

    onCancel(id) {
      const controller = activeControllers.get(id);
      if (controller) {
        controller.abort();
        activeControllers.delete(id);
      }
    },
  };
}
