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

/** Register flows.run/resume/cancel into a (structurally-typed) registry. */
export function registerFlowAutomationActions(
  registry: ActionRegistryLike,
  log: (m: string) => void,
): void {
  const hasFlows = (cwd: string) => discoverFlows(cwd).length > 0;
  const REASON = "no flows in this folder";

  registry.register({
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
      if (!flow) return "";
      return `/${flow}${task ? ` ${task}` : ""}`;
    },
  });

  registry.register({
    id: "flows.resume",
    source: "flows",
    label: "Resume a run",
    available: hasFlows,
    unavailableReason: REASON,
    payloadSchema: [{ key: "flow", label: "Flow", type: "enum", options: discoverFlows }],
    buildPrompt: ({ payload }) => {
      const flow = String(payload.flow ?? "").trim();
      return flow ? `/flows:resume ${flow}` : "";
    },
  });

  registry.register({
    id: "flows.cancel",
    source: "flows",
    label: "Cancel a run",
    available: hasFlows,
    unavailableReason: REASON,
    payloadSchema: [{ key: "runId", label: "Run id", type: "string" }],
    buildPrompt: ({ payload }) => {
      const runId = String(payload.runId ?? "").trim();
      return runId ? `/flows:cancel ${runId}` : "";
    },
  });

  log("[flows] registered automation actions: flows.run, flows.resume, flows.cancel");
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
  registerFlowAutomationActions(reg, log);
}
