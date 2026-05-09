/**
 * Shared extension-slash-command dispatch branch used by both bridge.ts
 * (sessionPrompt callback) and command-handler.ts (slash else-arm fallback).
 *
 * Routing-step 9 from `command-routing` spec:
 *   - if text matches a registered extension command (per pi.getCommands(),
 *     filtered through `isExtensionSlashCommand`), dispatch via
 *     `pi.dispatchCommand` when available (pi 0.71+), else emit a
 *     `command_feedback { status: "error" }` stopgap.
 *   - if text is NOT an extension command, return `false` so the caller can
 *     fall through to its existing template-expansion / sendUserMessage path.
 *
 * Guarantees: EXACTLY ONE `started` event and EXACTLY ONE terminal event
 * (`completed` xor `error`) per dispatch. No `sendUserMessage` is invoked
 * by this helper — that is the caller's responsibility on the false return.
 *
 * See change: fix-extension-slash-commands-in-dashboard.
 */
import type { ExtensionToServerMessage } from "@blackbelt-technology/pi-dashboard-shared/protocol.js";
import { hasDispatchCommand, isExtensionSlashCommand } from "./bridge-context.js";

export type FeedbackSink = (msg: ExtensionToServerMessage) => void;

const PI_071_REQUIRED =
  "Extension slash commands cannot be dispatched from the dashboard yet — requires pi 0.71+ (`pi.dispatchCommand`). Invoke from the pi TUI, or use the extension's tools directly.";

function emitFeedback(
  sink: FeedbackSink | undefined,
  sessionId: string,
  command: string,
  status: "started" | "completed" | "error",
  message?: string,
): void {
  if (!sink) return;
  sink({
    type: "event_forward",
    sessionId,
    event: {
      eventType: "command_feedback",
      timestamp: Date.now(),
      data: message === undefined ? { command, status } : { command, status, message },
    },
  });
}

/**
 * Try to dispatch a slash command as an extension command.
 *
 * @returns `true` if the helper handled the text (extension command detected;
 *          dispatch attempted or stopgap emitted). The caller MUST NOT fall
 *          through to template expansion or `sendUserMessage`.
 * @returns `false` if `text` is not an extension slash command. The caller
 *          SHOULD continue with its existing fallback path.
 */
export async function tryDispatchExtensionCommand(
  pi: unknown,
  text: string,
  sessionId: string,
  sink: FeedbackSink | undefined,
): Promise<boolean> {
  // Defensive: pi.getCommands() can throw on a stale ctx during dispose.
  let commands: Array<{ name: string; source?: string }> = [];
  try {
    const got = (pi as any)?.getCommands?.();
    if (Array.isArray(got)) commands = got;
  } catch (err) {
    console.warn("[dashboard] getCommands stale on slash-dispatch", err);
    return false; // fall through to existing path; preserve today's behavior
  }

  if (!isExtensionSlashCommand(text, commands)) return false;

  emitFeedback(sink, sessionId, text, "started");

  if (hasDispatchCommand(pi)) {
    try {
      await (pi as any).dispatchCommand(text, { streamingBehavior: "followUp" });
      emitFeedback(sink, sessionId, text, "completed");
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      emitFeedback(sink, sessionId, text, "error", message);
    }
    return true;
  }

  // Stopgap: pi 0.70 — surface the limitation instead of silently sending to LLM.
  emitFeedback(sink, sessionId, text, "error", PI_071_REQUIRED);
  return true;
}
