/**
 * Tools that mean the agent is blocked waiting for the user.
 *
 * - `ask_user` — dashboard bridge interactive tool (UI cards / prompt bus)
 * - `ask` — OMP/pi core TUI ask tool (Claude Code AskUserQuestion analogue)
 * - `write xd://propose` — plan approval host (`xdev.tool === "propose"` / `path === "xd://propose"`)
 *
 * Architecture Note & Core Gap:
 * The `@oh-my-pi` TUI `#approvePlan` / `handlePlanApproval` continuation is external and
 * unreachable from `omp-dashboard`. The dashboard host handles `write xd://propose` via
 * PromptBus (`prompt_request` with `pipeline: "plan-approval"`), returning user choice.
 * Answers dispatch approval to host implementations via `onPlanApproved` / `pi.events.emit("plan:approved", ...)`.
 *
 * Used by unread-stripes, push fan-out, questionFirst ordering, and client
 * "needs you" visuals so all paths light the same attention signals.
 */
export const INPUT_NEEDED_TOOLS = ["ask_user", "ask", "write", "propose"] as const;

export type InputNeededTool = (typeof INPUT_NEEDED_TOOLS)[number];

/** Check if a tool call is a plan proposal (`write xd://propose` or `xdev.tool === "propose"`). */
export function isProposeWrite(
  toolName: string | null | undefined,
  args?: Record<string, unknown> | null,
): boolean {
  if (!toolName) return false;
  const name = toolName.toLowerCase();
  if (name === "write:xd://propose" || name === "propose") return true;
  if (name === "write") {
    if (!args) return false;
    const path = typeof args.path === "string" ? args.path : undefined;
    const xdev = args.xdev as Record<string, unknown> | undefined;
    const xdevTool = typeof xdev?.tool === "string" ? xdev.tool : undefined;
    if (path === "xd://propose" || path?.includes("xd://propose") || xdevTool === "propose") {
      return true;
    }
  }
  return false;
}

/** True when `toolName` (and optional `args`) represents a known user-input tool. */
export function isInputNeededTool(
  toolName: string | null | undefined,
  args?: Record<string, unknown> | null,
): boolean {
  return toolName === "ask_user" || toolName === "ask" || isProposeWrite(toolName, args);
}
