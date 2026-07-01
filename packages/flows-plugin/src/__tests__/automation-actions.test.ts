/**
 * Flows → automation action registration: per-cwd discovery, availability
 * gating, enum options, seed-prompt building, and graceful no-op when the
 * registry is absent. See change: register-plugin-automation-events.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  discoverFlows,
  registerFlowAutomationActions,
  wireFlowAutomationActions,
  type ActionRegistryLike,
} from "../server/automation-actions.js";

function mkFlow(root: string, ns: string, name: string): void {
  const dir = path.join(root, ".pi", "flows", "flows", ns, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "flow.yaml"), "name: x\n");
}

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flows-actions-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Minimal registry capturing registrations. */
function capturingRegistry() {
  const regs: Parameters<ActionRegistryLike["register"]>[0][] = [];
  const registry: ActionRegistryLike = {
    register: (r) => {
      regs.push(r);
      return true;
    },
  };
  return { registry, regs };
}

describe("discoverFlows", () => {
  it("lists <ns>:<name> for each flow.yaml, sorted", () => {
    mkFlow(tmp, "test", "capabilities");
    mkFlow(tmp, "test", "subflow");
    mkFlow(tmp, "custom", "deploy");
    expect(discoverFlows(tmp)).toEqual(["custom:deploy", "test:capabilities", "test:subflow"]);
  });
  it("returns [] when no flows dir exists", () => {
    expect(discoverFlows(tmp)).toEqual([]);
  });
});

describe("registerFlowAutomationActions", () => {
  it("registers run/resume/cancel; available gated on cwd flows; enum options resolve", () => {
    const { registry, regs } = capturingRegistry();
    registerFlowAutomationActions(registry, () => {});
    expect(regs.map((r) => r.id)).toEqual(["flows.run", "flows.resume", "flows.cancel"]);

    const run = regs.find((r) => r.id === "flows.run")!;
    expect(run.available!(tmp)).toBe(false); // no flows yet
    mkFlow(tmp, "test", "capabilities");
    expect(run.available!(tmp)).toBe(true);

    const flowField = run.payloadSchema!.find((f) => f.key === "flow")!;
    expect(flowField.type).toBe("enum");
    expect(flowField.options!(tmp)).toEqual(["test:capabilities"]);
  });

  it("flows.run.buildPrompt emits /<ns>:<name> <task>", () => {
    const { registry, regs } = capturingRegistry();
    registerFlowAutomationActions(registry, () => {});
    const run = regs.find((r) => r.id === "flows.run")!;
    expect(run.buildPrompt({ payload: { flow: "test:capabilities", task: "do it" }, automation: {} }))
      .toBe("/test:capabilities do it");
    expect(run.buildPrompt({ payload: { flow: "", task: "x" }, automation: {} })).toBe("");
  });

  it("rejects malformed flow/runId payloads (no mangled slash command)", () => {
    const { registry, regs } = capturingRegistry();
    registerFlowAutomationActions(registry, () => {});
    const run = regs.find((r) => r.id === "flows.run")!;
    const resume = regs.find((r) => r.id === "flows.resume")!;
    const cancel = regs.find((r) => r.id === "flows.cancel")!;
    // whitespace / control chars / missing ns shift the command boundary → empty
    expect(run.buildPrompt({ payload: { flow: "test:cap x", task: "t" }, automation: {} })).toBe("");
    expect(run.buildPrompt({ payload: { flow: "nocolon", task: "t" }, automation: {} })).toBe("");
    expect(resume.buildPrompt({ payload: { flow: "a b:c" }, automation: {} })).toBe("");
    expect(cancel.buildPrompt({ payload: { runId: "bad id" }, automation: {} })).toBe("");
    expect(cancel.buildPrompt({ payload: { runId: "run-123" }, automation: {} })).toBe("/flows:cancel run-123");
  });

  it("warns and skips when a registration is rejected by the registry", () => {
    const warn = vi.fn();
    const registry: ActionRegistryLike = { register: (r) => r.id !== "flows.resume" };
    registerFlowAutomationActions(registry, () => {}, warn);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("flows.resume"));
  });
});

describe("wireFlowAutomationActions", () => {
  it("registers when the registry is present", () => {
    const { registry, regs } = capturingRegistry();
    wireFlowAutomationActions((name) => (name === "automation.action-registry" ? registry : undefined), () => {}, () => {});
    expect(regs.length).toBe(3);
  });
  it("no-ops with a warning when the registry is absent", () => {
    const warn = vi.fn();
    wireFlowAutomationActions(() => undefined, () => {}, warn);
    expect(warn).toHaveBeenCalled();
  });
});
