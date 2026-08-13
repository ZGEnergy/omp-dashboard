import fs from "node:fs";
import pathModule from "node:path";
import { isProposeWrite } from "@blackbelt-technology/pi-dashboard-shared/input-needed-tools.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { PromptBus } from "./prompt-bus.js";

export interface RegisterProposeToolOptions {
  onPlanApproved?: (info: { toolCallId: string; planPath: string }) => void;
}

/**
 * Register plan approval host for `write xd://propose` / `xdev.tool === "propose"`.
 *
 * Architecture Note & Core Gap:
 * The `@oh-my-pi` TUI `#approvePlan` / `handlePlanApproval` continuation lives outside
 * `omp-dashboard` and is external/unreachable.
 * Dashboard host approval is implemented via PromptBus (`prompt_request` with `pipeline: "plan-approval"`).
 * When approved, the host dispatches via `onPlanApproved` and `pi.events.emit("plan:approved", ...)`.
 */
export function registerProposeTool(
  pi: ExtensionAPI,
  getPromptBus: () => PromptBus | undefined,
  options?: RegisterProposeToolOptions,
): void {
  const executePropose = async (
    toolCallId: unknown,
    params: Record<string, unknown>,
    signal: unknown,
  ): Promise<string> => {
    const promptBus = getPromptBus();
    const pathStr = typeof params.path === "string" ? params.path : undefined;

    // Extract title and plan path
    let title = typeof params.title === "string" ? params.title.trim() : "";
    if (!title && typeof params.content === "string") {
      const match = params.content.match(/^#+\s*(.+)$/m);
      if (match?.[1]) {
        title = match[1].trim();
      }
    }
    if (!title) {
      title = "Plan Approval";
    }

    let planPath = typeof params.planPath === "string" ? params.planPath : pathStr;
    if (planPath) {
      planPath = planPath.replace(/^local:\/\//, "");
    }
    if (!planPath || planPath === "xd://propose" || planPath.includes("xd://propose")) {
      planPath = "plan.md";
    }

    if (!promptBus) {
      throw new Error("PromptBus unavailable for plan approval");
    }

    const id = String(toolCallId ?? crypto.randomUUID());

    // Issue PromptBus request BEFORE tool execution finishes
    const res = await promptBus.request(
      {
        pipeline: "plan-approval",
        type: "select",
        question: `Plan Approval: ${title}\nPath: local://${planPath}`,
        options: ["Approve and execute", "Refine plan", "Reject"],
        metadata: { toolCallId: id, planPath, xdevTool: "propose" },
      },
      signal as AbortSignal | undefined,
    );

    if (res.cancelled || res.answer === "Reject") {
      return "Plan approval rejected by user. Remaining in plan mode.";
    }

    if (res.answer === "Refine plan") {
      // Solicit refinement input from user
      const inputRes = await promptBus.request(
        {
          pipeline: "plan-approval",
          type: "input",
          question: "Plan Refinement Feedback:",
          metadata: { toolCallId: id, planPath, xdevTool: "propose" },
        },
        signal as AbortSignal | undefined,
      );
      const feedback = inputRes.answer || "User requested plan refinement.";
      return `Plan refinement requested by user: ${feedback}. Remaining in plan mode.`;
    }

    if (res.answer === "Approve and execute") {
      options?.onPlanApproved?.({ toolCallId: id, planPath });
      if (pi.events && typeof pi.events.emit === "function") {
        pi.events.emit("plan:approved", { toolCallId: id, planPath });
      }
      return "Plan approved by user. Proceeding to execution.";
    }

    return "Plan approval completed.";
  };

  const writeHandler = async (
    toolCallId: unknown,
    rawParams: unknown,
    signal: unknown,
    _onUpdate: unknown,
    _ctx: unknown,
  ): Promise<string> => {
    const params = (rawParams as Record<string, unknown>) ?? {};

    if (isProposeWrite("write", params)) {
      return executePropose(toolCallId, params, signal);
    }

    // Default: ordinary file write
    const targetPath = typeof params.path === "string" ? params.path : undefined;
    const content = typeof params.content === "string" ? params.content : "";
    if (targetPath) {
      const dir = pathModule.dirname(targetPath);
      if (dir && dir !== ".") {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(targetPath, content, "utf-8");
      return `Wrote ${content.length} bytes to ${targetPath}`;
    }

    return "Write executed.";
  };

  const proposeHandler = async (
    toolCallId: unknown,
    rawParams: unknown,
    signal: unknown,
    _onUpdate: unknown,
    _ctx: unknown,
  ): Promise<string> => {
    const params = (rawParams as Record<string, unknown>) ?? {};
    return executePropose(toolCallId, params, signal);
  };

  pi.registerTool({
    name: "write",
    label: "Write",
    description: "Write content to a file or submit plan approval via xd://propose",
    execute: writeHandler,
  });

  pi.registerTool({
    name: "propose",
    label: "Propose Plan",
    description: "Submit plan proposal for user approval",
    execute: proposeHandler,
  });
}
