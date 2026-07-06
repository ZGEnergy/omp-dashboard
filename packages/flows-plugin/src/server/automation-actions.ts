/**
 * Flows → automation action contribution (publish/collect).
 *
 * Flows PUBLISHES an immutable action contribution under
 * `automation.action.flows` via `ctx.provide`. It does NOT consume an
 * automation-owned registry, import the automation package, or depend on load
 * order — the automation plugin collects published contributions lazily. If
 * flows is disabled, it publishes nothing and `flows.run` never appears.
 *
 * The contribution is typed structurally so flows needs no compile dependency
 * on automation. See change: decouple-automation-action-registry.
 */
import fs from "node:fs";
import path from "node:path";

/** Publish key automation collects under (`automation.action.<source>`). */
export const ACTION_CONTRIBUTION_KEY = "automation.action.flows";

/** Structural mirror of one automation payload-schema field. */
interface ActionFieldSpecLike {
  key: string;
  label: string;
  type: "string" | "multiline" | "text" | "enum";
  help?: string;
  options?: (cwd: string) => string[];
}

/** Structural mirror of an automation action contribution. */
export interface ActionContributionLike {
  id: string;
  source: string;
  label: string;
  description?: string;
  available?: (cwd: string) => boolean;
  unavailableReason?: string;
  payloadSchema?: ActionFieldSpecLike[];
  /** Event-dispatch: emit a configured event into the run session. */
  buildEvent?: (args: { payload: Record<string, unknown>; automation: unknown }) =>
    | { eventType: string; data?: Record<string, unknown> }
    | null;
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
 * A flow id is `<ns>:<name>` (from discoverFlows). It is placed into the
 * `flow:run` event payload, so a malformed value is rejected (emit nothing).
 */
const FLOW_ID_RE = /^[\w.-]+:[\w.-]+$/;

/** A plain-object `payload.inputs` with at least one key, else undefined.
 *  Values are forwarded as-is (already per-fire resolved, types preserved). */
function normalizeInputs(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  return Object.keys(obj).length > 0 ? obj : undefined;
}

/** Build the flows action contribution(s): flows.run only. */
export function flowsActionContributions(): ActionContributionLike[] {
  const hasFlows = (cwd: string) => discoverFlows(cwd).length > 0;
  return [
    {
      id: "flows.run",
      source: "flows",
      label: "Run a flow",
      description: "Run a flow with a task.",
      available: hasFlows,
      unavailableReason: "no flows in this folder",
      payloadSchema: [
        { key: "flow", label: "Flow", type: "enum", options: discoverFlows, help: "Discovered in .pi/flows/flows" },
        { key: "task", label: "Task", type: "multiline", help: "Passed as the flow's initial task." },
      ],
      // Emit flow:run into the run session (the event pi-flows listens for),
      // not a slash-command prompt. Runs finalize on agent_end.
      //
      // `payload` is already per-fire interpolated by the engine (the
      // `${{trigger}}` token in `payload.inputs` is resolved to the fired
      // value, type preserved). We forward `payload.inputs` as `data.inputs`,
      // which pi-flows consumes as `flowInput` → `${{flow.input.<name>}}`.
      // `task` stays optional and may coexist with `inputs`.
      // See change: wire-flow-inputs-in-automation.
      buildEvent: ({ payload }) => {
        const flow = String(payload.flow ?? "").trim();
        if (!FLOW_ID_RE.test(flow)) return null;
        const task = String(payload.task ?? "").trim();
        const inputs = normalizeInputs(payload.inputs);
        const data: Record<string, unknown> = { flowName: flow };
        if (task) data.task = task;
        if (inputs) data.inputs = inputs;
        return { eventType: "flow:run", data };
      },
    },
  ];
}

/**
 * Publish the flows action contribution for automation to collect. Pure
 * publisher: consumes nothing, references no automation code, order-agnostic.
 */
export function provideFlowsActions(
  provide: (name: string, value: unknown) => void,
  log: (m: string) => void,
): void {
  provide(ACTION_CONTRIBUTION_KEY, flowsActionContributions());
  log("[flows] published automation action: flows.run");
}
