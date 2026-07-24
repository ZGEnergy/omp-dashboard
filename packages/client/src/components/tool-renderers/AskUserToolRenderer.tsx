import { mdiAlertCircle, mdiCheckboxMarkedOutline, mdiCheckCircle, mdiCommentQuestion, mdiFormatListBulleted, mdiFormTextbox, mdiRadioboxMarked, mdiViewListOutline } from "@mdi/js";
import { Icon } from "@mdi/react";
import type React from "react";
import { t as i18nT } from "../../lib/i18n";
import { MarkdownContent } from "../MarkdownContent.js";
import type { ToolRendererProps } from "./types.js";

const methodIcons: Record<string, string> = {
  confirm: mdiCheckboxMarkedOutline,
  select: mdiRadioboxMarked,
  multiselect: mdiFormatListBulleted,
  input: mdiFormTextbox,
};

const methodLabels: Record<string, string> = {
  confirm: "Confirm",
  select: "Select",
  multiselect: "Multi-select",
  input: "Text input",
};
export interface AskToolQuestionViewModel {
  id: string;
  question: string;
  title?: string;
  options: Array<{ label: string; description?: string }>;
  multi: boolean;
  recommended?: number;
}

export interface AskToolViewModel {
  toolName: "ask" | "ask_user";
  questions: AskToolQuestionViewModel[];
  status: "running" | "complete" | "error";
  cancelled: boolean;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeOption(value: unknown): { label: string; description?: string } | null {
  if (typeof value === "string") {
    return value.trim().length > 0 ? { label: value } : null;
  }
  if (!value || typeof value !== "object") return null;
  const option = value as Record<string, unknown>;
  const label = typeof option.label === "string" ? option.label : "";
  if (label.trim().length === 0) return null;
  return {
    label,
    ...(typeof option.description === "string" ? { description: option.description } : {}),
  };
}

function normalizeOptions(value: unknown): Array<{ label: string; description?: string }> {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeOption).filter((option): option is { label: string; description?: string } => option !== null);
}

/** Normalize core `ask` and legacy `ask_user` question shapes for safe display. */
export function normalizeAskToolView(
  toolName: string,
  args?: Record<string, unknown>,
  details?: Record<string, unknown>,
  status: "running" | "complete" | "error" = "complete",
): AskToolViewModel {
  const normalizedToolName: "ask" | "ask_user" = toolName === "ask" ? "ask" : "ask_user";
  const rawQuestions = normalizedToolName === "ask"
    ? (Array.isArray(args?.questions) ? args.questions : [])
    : [{
        id: "q1",
        question: args?.message ?? args?.question ?? args?.title,
        title: args?.title,
        options: args?.options,
        multi: args?.method === "multiselect",
      }];
  const questions = rawQuestions.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const question = raw as Record<string, unknown>;
    const text = stringValue(question.question ?? question.message ?? question.title, "Question");
    const title = stringValue(question.title ?? question.header);
    return [{
      id: stringValue(question.id, `q${index + 1}`) || `q${index + 1}`,
      question: text,
      ...(title ? { title } : {}),
      options: normalizeOptions(question.options),
      multi: question.multi === true,
      ...(typeof question.recommended === "number" ? { recommended: question.recommended } : {}),
    }];
  });
  return {
    toolName: normalizedToolName,
    questions,
    status,
    cancelled: details?.cancelled === true,
  };
}

interface BatchSubQuestion {
  title?: string;
}

/**
 * Renders a resolved `method:"batch"` ask_user on reload. The live
 * BatchRenderer wizard is gone after a refresh (the server only replays
 * pending prompts), so this reconstructs the per-question answers from the
 * persisted tool result: `args.questions` for the prompts and
 * `toolDetails.results` (index-aligned: boolean | string | string[]) for the
 * answers. Without this branch the generic path looked for `User responded:`
 * (batch text is `User completed batch`) and read `args.options` (batch uses
 * `args.questions`), so no answers rendered.
 */
function batchAnswerNode(answer: unknown): React.ReactNode {
  if (answer === undefined || answer === null) {
    return <span className="text-[var(--text-tertiary)] italic">(unanswered)</span>;
  }
  if (typeof answer === "boolean") return answer ? "Yes" : "No";
  if (Array.isArray(answer)) {
    if (answer.length === 0) return <span className="text-[var(--text-tertiary)] italic">(none)</span>;
    return (
      <span className="flex flex-wrap gap-1">
        {answer.map((v, i) => (
          <span key={i} className="inline-block rounded px-1.5 py-0.5 text-[11px] bg-blue-500/15 text-blue-300">
            {String(v)}
          </span>
        ))}
      </span>
    );
  }
  if (answer && typeof answer === "object" && "value" in (answer as Record<string, unknown>)) {
    const v = (answer as Record<string, unknown>).value;
    const atts = (answer as Record<string, unknown>).attachments;
    const count = Array.isArray(atts) ? atts.length : 0;
    const text = String(v ?? "");
    return (
      <span>
        {text === "" ? <span className="text-[var(--text-tertiary)] italic">{i18nT("common.noText", undefined, "(no text)")}</span> : text}
        {count > 0 && <span className="ml-1.5 text-[10px] text-[var(--text-tertiary)]">+{count} image{count > 1 ? "s" : ""}</span>}
      </span>
    );
  }
  const s = String(answer);
  return s === "" ? <span className="text-[var(--text-tertiary)] italic">{i18nT("common.leftBlank", undefined, "(left blank)")}</span> : s;
}

function AskUserBatchRenderer({ args, result, toolDetails }: ToolRendererProps) {
  const title = (args?.title as string) ?? "Questions";
  const questions = (Array.isArray(args?.questions) ? (args?.questions as BatchSubQuestion[]) : []).filter(Boolean);
  const results = Array.isArray(toolDetails?.results) ? (toolDetails!.results as unknown[]) : undefined;
  const cancelled = toolDetails?.cancelled === true || /cancelled batch/i.test(result ?? "");

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Icon path={mdiViewListOutline} size={0.5} className="text-blue-400 shrink-0" />
        <span className="text-xs font-medium text-blue-400">{i18nT("common.batch", undefined, "Batch")}</span>
        {cancelled ? (
          <span className="text-[11px] text-[var(--text-tertiary)]">cancelled</span>
        ) : (
          <span className="text-[11px] text-green-400">{results?.length ?? questions.length} answers</span>
        )}
      </div>

      {title && (
        <div className="text-xs text-[var(--text-primary)]">
          <MarkdownContent content={title} />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {questions.map((q, i) => (
          <div
            key={i}
            className="flex items-start gap-2.5 px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)]"
          >
            <span className="w-4 h-4 rounded grid place-items-center text-[10px] font-semibold bg-blue-500/20 text-blue-300 shrink-0 mt-0.5">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)] truncate">{q.title}</div>
              <div className="text-xs text-[var(--text-primary)] mt-0.5">
                {cancelled && !results ? (
                  <span className="text-[var(--text-tertiary)] italic">{i18nT("common.notAnswered", undefined, "(not answered)")}</span>
                ) : (
                  batchAnswerNode(results?.[i])
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function coreQuestionAnswer(
  question: AskToolQuestionViewModel,
  index: number,
  details: Record<string, unknown> | undefined,
  result: string | undefined,
): string[] {
  const results = Array.isArray(details?.results) ? details.results : [];
  const entry = results.find((value) => value && typeof value === "object" && (value as Record<string, unknown>).id === question.id)
    ?? results[index];
  if (entry && typeof entry === "object") {
    const record = entry as Record<string, unknown>;
    if (Array.isArray(record.selectedOptions)) return record.selectedOptions.filter((value): value is string => typeof value === "string");
    if (typeof record.customInput === "string") return [record.customInput];
  }
  if (Array.isArray(details?.selectedOptions)) return details.selectedOptions.filter((value): value is string => typeof value === "string");
  if (typeof details?.customInput === "string") return [details.customInput];
  if (result) {
    const escapedId = question.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = result.match(new RegExp(`(?:^|\\n)\\s*${escapedId}\\s*:\\s*(\\[[^\\n]*\\])`));
    if (match) {
      try {
        const parsed: unknown = JSON.parse(match[1]!);
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
      } catch {
        return [];
      }
    }
  }
  return [];
}

function AskCoreRenderer({ args, status, result, toolDetails, context, onRespondToUi, onRespond }: ToolRendererProps) {
  const view = normalizeAskToolView("ask", args, toolDetails, status);
  const cancelled = view.cancelled || /cancelled ask/i.test(result ?? "");
  const respond = onRespond ?? context.onRespond;
  const respondToUi = onRespondToUi ?? context.onRespondToUi;
  const requestId = stringValue(toolDetails?.requestId ?? args?.requestId);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Icon path={mdiCommentQuestion} size={0.5} className="text-blue-400 shrink-0" />
        <span className="text-xs font-medium text-blue-400">Ask</span>
        {cancelled ? (
          <span className="text-[11px] text-[var(--text-tertiary)]">cancelled</span>
        ) : status === "complete" ? (
          <span className="text-[11px] text-green-400">answered</span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        {view.questions.map((question, index) => {
          const selected = coreQuestionAnswer(question, index, toolDetails, result);
          const respondToOption = (label: string) => {
            const answer = question.multi ? { values: [label] } : label;
            if (respond) {
              respond(answer);
            } else if (respondToUi) {
              respondToUi(requestId || question.id, answer);
            }
          };
          return (
            <div key={question.id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1.5">
              {question.title && question.title !== question.question && (
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)] break-words whitespace-normal">{question.title}</div>
              )}
              <div className="text-xs text-[var(--text-primary)] break-words whitespace-normal"><MarkdownContent content={question.question} /></div>
              {question.options.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {question.options.map((option) => {
                    const isSelected = selected.includes(option.label);
                    const className = isSelected
                      ? "inline-flex max-w-full min-w-0 flex-wrap items-start gap-1 px-1.5 py-0.5 text-xs rounded bg-green-600/20 border border-green-500/40 text-green-400 font-medium whitespace-normal break-words text-left"
                      : "inline-flex max-w-full min-w-0 flex-wrap items-start gap-1 px-1.5 py-0.5 text-xs rounded bg-[var(--bg-primary)] border border-[var(--border-secondary)] text-[var(--text-tertiary)] whitespace-normal break-words text-left";
                    const optionContent = (
                      <>
                        {isSelected && <Icon path={mdiCheckCircle} size={0.4} className="inline mr-0.5 -mt-0.5 shrink-0" />}
                        <span className="min-w-0 break-words whitespace-normal">{option.label}</span>
                        {option.description && (
                          <span className="basis-full min-w-0 break-words whitespace-normal text-[var(--text-secondary)]">{option.description}</span>
                        )}
                      </>
                    );
                    return status === "running" ? (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => respondToOption(option.label)}
                        className={className}
                      >
                        {optionContent}
                      </button>
                    ) : (
                      <span key={option.label} title={option.description} className={className}>
                        {optionContent}
                      </span>
                    );
                  })}
                </div>
              )}
              {question.options.length === 0 && selected.length > 0 && (
                <div className="mt-1 flex items-center gap-1.5 text-xs">
                  <Icon path={mdiCheckCircle} size={0.45} className="text-green-400 shrink-0" />
                  <span className="text-green-400 font-medium">{i18nT("auto.response", undefined, "Response:")}</span>
                  <span className="text-[var(--text-primary)] break-words whitespace-normal">{selected.join(", ")}</span>
                </div>
              )}
              {cancelled && selected.length === 0 && (
                <div className="mt-1 text-xs text-[var(--text-tertiary)] italic">{i18nT("auto.not_answered", undefined, "(not answered)")}</div>
              )}
            </div>
          );
        })}
      </div>
      {status === "error" && result && (
        <div className="flex items-start gap-1.5 text-xs">
          <Icon path={mdiAlertCircle} size={0.45} className="text-red-400 shrink-0 mt-0.5" />
          <pre className="whitespace-pre-wrap text-red-400/80">{result}</pre>
        </div>
      )}
    </div>
  );
}

/** Rich renderer for ask_user tool calls — shows question, method, options, and response */
export function AskUserToolRenderer(props: ToolRendererProps) {
  if (props.toolName === "ask") return <AskCoreRenderer {...props} />;
  const { args, status, result } = props;
  const method = (args?.method as string) ?? "input";

  // Batch dispatches multiple sub-questions; render the per-question summary.
  if (method === "batch") {
    return <AskUserBatchRenderer {...props} />;
  }

  const title = (args?.title as string) ?? (args?.question as string) ?? "";
  const message = (args?.message as string) ?? (args?.question as string) ?? "";
  const options = normalizeOptions(args?.options).map((option) => option.label);
  const icon = methodIcons[method] ?? mdiCommentQuestion;
  const label = methodLabels[method] ?? method;

  // Parse the result to extract the user's response
  let userResponse: string | undefined;
  if (result) {
    const match = result.match(/User responded:\s*(.*)/s);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (typeof parsed === "boolean") {
          userResponse = parsed ? "Yes" : "No";
        } else if (typeof parsed === "string") {
          userResponse = parsed;
        } else if (parsed && typeof parsed === "object" && "value" in parsed) {
          userResponse = String(parsed.value);
        } else {
          userResponse = match[1];
        }
      } catch {
        userResponse = match[1];
      }
    }
  }

  const isError = status === "error";
  const isComplete = status === "complete";

  return (
    <div className="space-y-2">
      {/* Method badge */}
      <div className="flex items-center gap-1.5">
        <Icon path={icon} size={0.5} className="text-blue-400 shrink-0" />
        <span className="text-xs font-medium text-blue-400">{label}</span>
      </div>

      {/* Question title */}
      {title && (
        <div className="text-xs text-[var(--text-primary)]">
          <MarkdownContent content={title} />
        </div>
      )}

      {/* Message body (if different from title) */}
      {message && message !== title && (
        <div className="text-xs text-[var(--text-secondary)]">
          <MarkdownContent content={message} />
        </div>
      )}

      {/* Options list — only show when complete (running state has interactive dialog below) */}
      {options && options.length > 0 && status !== "running" && (
        <div className="flex flex-wrap gap-1">
          {options.map((opt, i) => {
            const isSelected = isComplete && userResponse === opt;
            return (
              <span
                key={i}
                className={isSelected
                  ? "px-1.5 py-0.5 text-xs rounded bg-green-600/20 border border-green-500/40 text-green-400 font-medium"
                  : "px-1.5 py-0.5 text-xs rounded bg-[var(--bg-primary)] border border-[var(--border-secondary)] text-[var(--text-tertiary)]"
                }
              >
                {isSelected && <Icon path={mdiCheckCircle} size={0.4} className="inline mr-0.5 -mt-0.5" />}
                {opt}
              </span>
            );
          })}
        </div>
      )}

      {/* Response (for non-select methods like input/confirm) */}
      {isComplete && userResponse !== undefined && !(options && options.length > 0) && (
        <div className="flex items-center gap-1.5 text-xs">
          <Icon path={mdiCheckCircle} size={0.45} className="text-green-400 shrink-0" />
          <span className="text-green-400 font-medium">{i18nT("common.response", undefined, "Response:")}</span>
          <span className="text-[var(--text-primary)]">{userResponse}</span>
        </div>
      )}

      {/* Error output */}
      {isError && result && (
        <div className="flex items-start gap-1.5 text-xs">
          <Icon path={mdiAlertCircle} size={0.45} className="text-red-400 shrink-0 mt-0.5" />
          <pre className="whitespace-pre-wrap text-red-400/80">{result}</pre>
        </div>
      )}
    </div>
  );
}
