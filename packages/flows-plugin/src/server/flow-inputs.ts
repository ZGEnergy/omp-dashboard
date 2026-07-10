/**
 * Read-only reader for a flow's declared `inputs:` schema.
 *
 * Parses `<cwd>/.omp/flows/flows/<ns>/<name>/flow.yaml` and returns the
 * declared flow-level inputs (name + type + required). This is the source of
 * truth the automation input-wiring UI renders from. It NEVER writes a flow
 * file — the automation side only reads the flow's input contract.
 *
 * Mirrors pi-flows' `FlowInputDecl` shape (`flow-typed-io-and-run-state`)
 * without a compile dependency on the pi-flows package.
 *
 * See change: wire-flow-inputs-in-automation.
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export type FlowInputType = "string" | "number" | "boolean" | "object" | "array";
const VALID_TYPES: readonly FlowInputType[] = ["string", "number", "boolean", "object", "array"];

export interface FlowInputField {
  name: string;
  type: FlowInputType;
  required: boolean;
}

/** Resolve a `<ns>:<name>` flow id to its `flow.yaml` path under `cwd`. */
export function flowYamlPath(cwd: string, flowId: string): string | null {
  const m = /^([\w.-]+):([\w.-]+)$/.exec(flowId);
  if (!m) return null;
  return path.join(cwd, ".omp", "flows", "flows", m[1], m[2], "flow.yaml");
}

/**
 * Read a flow's declared inputs (read-only). Returns `[]` for a missing file,
 * unparseable yaml, or a flow with no `inputs:`. Invalid input entries are
 * skipped rather than throwing (isolate bad rows, keep good ones).
 */
export function readFlowInputs(cwd: string, flowId: string): FlowInputField[] {
  const p = flowYamlPath(cwd, flowId);
  if (!p) return [];
  let doc: unknown;
  try {
    doc = parseYaml(fs.readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
  const raw = (doc as Record<string, unknown> | null)?.inputs;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: FlowInputField[] = [];
  for (const [name, decl] of Object.entries(raw as Record<string, unknown>)) {
    const d = decl as Record<string, unknown> | null;
    const type = d?.type;
    if (typeof type !== "string" || !(VALID_TYPES as readonly string[]).includes(type)) continue;
    out.push({ name, type: type as FlowInputType, required: d?.required === true });
  }
  return out;
}
