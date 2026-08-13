import { isProposeWrite } from "@blackbelt-technology/pi-dashboard-shared/input-needed-tools.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { PromptBus } from "./prompt-bus.js";

export interface RegisterProposeToolOptions {
  onPlanApproved?: (info: { toolCallId: string; planPath: string }) => void;
}

export interface AgentToolResult {
  content: Array<{ type: "text"; text: string }>;
  details?: Record<string, unknown>;
}

export const ProposeParametersSchema = Type.Object(
  {
    path: Type.Optional(
      Type.String({
        description: "Target path (e.g. xd://propose or file path)",
      }),
    ),
    title: Type.Optional(
      Type.String({
        description: "Title of the plan proposal",
      }),
    ),
    content: Type.Optional(
      Type.String({
        description: "Markdown content of the plan proposal",
      }),
    ),
    planPath: Type.Optional(
      Type.String({
        description: "Path to the plan file (e.g. plan.md or local://docs/plan.md)",
      }),
    ),
    xdev: Type.Optional(
      Type.Object(
        {
          tool: Type.Optional(Type.String()),
        },
        { description: "xdev tool identifier" },
      ),
    ),
  },
  { description: "Parameters for plan approval proposals" },
);

export const WriteParametersSchema = Type.Object(
  {
    path: Type.String({ description: "File path to write, or xd://propose for plan approval" }),
    content: Type.String({ description: "Content to write" }),
  },
  { description: "Write parameters" },
);
type ToolDef = {
  name: string;
  label?: string;
  description?: string;
  parameters?: unknown;
  execute: (
    toolCallId: unknown,
    params: unknown,
    signal: unknown,
    onUpdate: unknown,
    ctx: unknown,
  ) => Promise<unknown>;
};

function getExistingWriteTool(pi: ExtensionAPI): ToolDef | undefined {
  const ext = pi as unknown as {
    getAllTools?: () => ToolDef[];
    getActiveTools?: () => ToolDef[];
    tools?: Map<string, ToolDef>;
  };
  if (typeof ext.getAllTools === "function") {
    const tools = ext.getAllTools();
    if (Array.isArray(tools)) {
      const found = tools.find((t) => t?.name === "write");
      if (found) return found;
    }
  }
  if (typeof ext.getActiveTools === "function") {
    const tools = ext.getActiveTools();
    if (Array.isArray(tools)) {
      const found = tools.find((t) => t?.name === "write");
      if (found) return found;
    }
  }
  if (ext.tools instanceof Map) {
    return ext.tools.get("write");
  }
  return undefined;
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
  ): Promise<AgentToolResult> => {
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
      const text = "Plan approval rejected by user. Remaining in plan mode.";
      return {
        content: [{ type: "text", text }],
        details: { approved: false, status: "rejected" },
      };
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
      const text = `Plan refinement requested by user: ${feedback}. Remaining in plan mode.`;
      return {
        content: [{ type: "text", text }],
        details: { approved: false, status: "refine", feedback },
      };
    }

    if (res.answer === "Approve and execute") {
      options?.onPlanApproved?.({ toolCallId: id, planPath });
      if (pi.events && typeof pi.events.emit === "function") {
        pi.events.emit("plan:approved", { toolCallId: id, planPath });
      }
      const text = "Plan approved by user. Proceeding to execution.";
      return {
        content: [{ type: "text", text }],
        details: { approved: true, status: "approved", planPath },
      };
    }

    const text = "Plan approval completed.";
    return {
      content: [{ type: "text", text }],
      details: { completed: true },
    };
  };

  const proposeHandler = async (
    toolCallId: unknown,
    rawParams: unknown,
    signal: unknown,
    _onUpdate: unknown,
    _ctx: unknown,
  ): Promise<AgentToolResult> => {
    const params = (rawParams as Record<string, unknown>) ?? {};
    return executePropose(toolCallId, params, signal);
  };

  const existingWrite = getExistingWriteTool(pi);
  if (existingWrite) {
    pi.registerTool({
      ...existingWrite,
      name: "write",
      label: existingWrite.label ?? "Write",
      description: existingWrite.description ?? "Write content to a file",
      parameters: existingWrite.parameters ?? WriteParametersSchema,
      async execute(
        toolCallId: unknown,
        rawParams: unknown,
        signal: unknown,
        onUpdate: unknown,
        ctx: unknown,
      ) {
        const params = (rawParams as Record<string, unknown>) ?? {};
        if (isProposeWrite("write", params)) {
          return executePropose(toolCallId, params, signal);
        }
        return existingWrite.execute(toolCallId, rawParams, signal, onUpdate, ctx);
      },
    });
  }

  pi.registerTool({
    name: "propose",
    label: "Propose Plan",
    description: "Submit plan proposal for user approval",
    parameters: ProposeParametersSchema,
    execute: proposeHandler,
  });
}
