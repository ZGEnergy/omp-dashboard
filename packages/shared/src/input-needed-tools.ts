/**
 * Tools that mean the agent is blocked waiting for the user.
 *
 * - `ask_user` — dashboard bridge interactive tool (UI cards / prompt bus)
 * - `ask` — OMP/pi core TUI ask tool (Claude Code AskUserQuestion analogue)
 *
 * Used by unread-stripes, push fan-out, questionFirst ordering, and client
 * "needs you" visuals so both paths light the same attention signals.
 */
export const INPUT_NEEDED_TOOLS = ["ask_user", "ask"] as const;

export type InputNeededTool = (typeof INPUT_NEEDED_TOOLS)[number];

/** True when `toolName` is a known user-input tool. */
export function isInputNeededTool(toolName: string | null | undefined): boolean {
  return toolName === "ask_user" || toolName === "ask";
}
