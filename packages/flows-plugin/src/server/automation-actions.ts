/**
 * Flows → automation action registration.
 *
 * The automation plugin publishes its action registry via the cross-plugin
 * service seam (`ctx.provide("automation.action-registry", …)`). Flows
 * consumes it and registers `flows.run` / `flows.resume` / `flows.cancel`,
 * each gated on flows existing in the target cwd. `flows.run` declares a
 * `flow` enum (discovered live from disk) + a `task` string and produces the
 * run session's seed prompt (`/<namespace>:<name> <task>`).
 *
 * The registry is consumed structurally (the `consume` seam returns
 * `unknown`) so flows needs no compile dependency on the automation package.
 *
 * See change: register-plugin-automation-events.
 */
import fs from "node:fs";
import path from "node:path";

/** Service-seam key the automation plugin publishes the registry under. */
export const ACTION_REGISTRY_SERVICE = "automation.action-registry";

/** Structural mirror of the automation ActionRegistry surface flows uses. */
interface ActionFieldSpecLike {
  key: string;
  label: string;
  type: "string" | "multiline" | "text" | "enum";
  help?: string;
  options?: (cwd: string) => string[];
}
interface ActionRegistrationLike {
  id: string;
  source: string;
  label: string;
  description?: string;
  available?: (cwd: string) => boolean;
  unavailableReason?: string;
  payloadSchema?: ActionFieldSpecLike[];
  buildPrompt: (args: { payload: Record<string, unknown>; automation: unknown }) => string;
}
export interface ActionRegistryLike {
  register(reg: ActionRegistrationLike): boolean;
}

/**
 * Discover flows on disk for a cwd: `<cwd>/.pi/flows/flows/<ns>/<name>/flow.yaml`
 * → `<ns>:<name>` (the command id pi registers the flow under). Sorted.
 */
export function discoverFlows(cwd: string): string[] {
  const root = path.join(cwd, ".pi", "flows", "flows");
  const out: string[] = [];
  let nsDirs: fs.Dirent[];
  try {
    nsDirs = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const ns of nsDirs) {
    if (!ns.isDirectory()) continue;
    const nsPath = path.join(root, ns.name);
    let nameDirs: fs.Dirent[];
    try {
      nameDirs = fs.readdirSync(nsPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const nm of nameDirs) {
      if (!nm.isDirectory()) continue;
      if (fs.existsSync(path.join(nsPath, nm.name, "flow.yaml"))) {
        out.push(`${ns.name}:${nm.name}`);
      }
    }
  }
  return out.sort();
}

/**
 * A flow id is `<ns>:<name>` (from discoverFlows); a run id is an opaque
 * token. Both are interpolated into slash commands, so anything with
 * whitespace/control chars would shift the command boundary — reject it and
 * emit no prompt (the run then seeds nothing rather than a mangled command).
 */
const FLOW_ID_RE = /^[\w.-]+:[\w.-]+$/;
const RUN_ID_RE = /^[\w.-]+$/;

/** Register flows.run/resume/cancel into a (structurally-typed) registry. */
export function registerFlowAutomationActions(
  registry: ActionRegistryLike,
  log: (m: string) => void,
  warn?: (m: string) => void,
): void {
  const hasFlows = (cwd: string) => discoverFlows(cwd).length > 0;
  const REASON = "no flows in this folder";

  const registrations: ActionRegistrationLike[] = [
    {
      id: "flows.run",
      source: "flows",
      label: "Run a flow",
      description: "Run a flow with a task.",
      available: hasFlows,
      unavailableReason: REASON,
      payloadSchema: [
        { key: "flow", label: "Flow", type: "enum", options: discoverFlows, help: "Discovered in .pi/flows/flows" },
        { key: "task", label: "Task", type: "multiline", help: "Passed as the flow's initial task." },
      ],
      buildPrompt: ({ payload }) => {
        const flow = String(payload.flow ?? "").trim();
        const task = String(payload.task ?? "").trim();
        if (!FLOW_ID_RE.test(flow)) return "";
        return `/${flow}${task ? ` ${task}` : ""}`;
      },
    },
    {
      id: "flows.resume",
      source: "flows",
      label: "Resume a run",
      available: hasFlows,
      unavailableReason: REASON,
      payloadSchema: [{ key: "flow", label: "Flow", type: "enum", options: discoverFlows }],
      buildPrompt: ({ payload }) => {
        const flow = String(payload.flow ?? "").trim();
        return FLOW_ID_RE.test(flow) ? `/flows:resume ${flow}` : "";
      },
    },
    {
      id: "flows.cancel",
      source: "flows",
      label: "Cancel a run",
      available: hasFlows,
      unavailableReason: REASON,
      payloadSchema: [{ key: "runId", label: "Run id", type: "string" }],
      buildPrompt: ({ payload }) => {
        const runId = String(payload.runId ?? "").trim();
        return RUN_ID_RE.test(runId) ? `/flows:cancel ${runId}` : "";
      },
    },
  ];

  const registered: string[] = [];
  const rejected: string[] = [];
  for (const reg of registrations) {
    if (registry.register(reg)) registered.push(reg.id);
    else rejected.push(reg.id);
  }
  if (registered.length > 0) {
    log(`[flows] registered automation actions: ${registered.join(", ")}`);
  }
  if (rejected.length > 0) {
    (warn ?? log)(`[flows] automation action registration rejected: ${rejected.join(", ")}`);
  }
}

/**
 * Consume the automation action registry and register flows actions. No-ops
 * (with a warning) when the registry is absent — flows loads fine without
 * the automation plugin.
 */
export function wireFlowAutomationActions(
  consume: (name: string) => unknown,
  log: (m: string) => void,
  warn: (m: string) => void,
): void {
  const reg = consume(ACTION_REGISTRY_SERVICE) as ActionRegistryLike | undefined;
  if (!reg || typeof reg.register !== "function") {
    warn("[flows] automation action registry unavailable; skipping action registration");
    return;
  }
  registerFlowAutomationActions(reg, log, warn);
}
