/**
 * Flows → automation action contribution (publish/collect): per-cwd flow
 * discovery, availability gating, enum options, flow:run event build, and
 * pure-publisher wiring (provide, no consume). See change:
 * decouple-automation-action-registry.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTION_CONTRIBUTION_KEY,
  discoverFlows,
  flowsActionContributions,
  provideFlowsActions,
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

describe("flowsActionContributions", () => {
  it("contributes flows.run only (no resume/cancel); gated on cwd flows; enum options resolve", () => {
    const contribs = flowsActionContributions();
    expect(contribs.map((c) => c.id)).toEqual(["flows.run"]);

    const run = contribs[0]!;
    expect(run.source).toBe("flows");
    expect(run.available!(tmp)).toBe(false); // no flows yet
    mkFlow(tmp, "test", "capabilities");
    expect(run.available!(tmp)).toBe(true);

    const flowField = run.payloadSchema!.find((f) => f.key === "flow")!;
    expect(flowField.type).toBe("enum");
    expect(flowField.options!(tmp)).toEqual(["test:capabilities"]);
  });

  it("flows.run emits a flow:run event (flowName+task)", () => {
    const run = flowsActionContributions()[0]!;
    expect(run.buildEvent!({ payload: { flow: "test:capabilities", task: "do it" }, automation: {} }))
      .toEqual({ eventType: "flow:run", data: { flowName: "test:capabilities", task: "do it" } });
    // task optional
    expect(run.buildEvent!({ payload: { flow: "test:capabilities" }, automation: {} }))
      .toEqual({ eventType: "flow:run", data: { flowName: "test:capabilities" } });
  });

  it("flows.run emits data.inputs (per-fire resolved, types preserved), task optional", () => {
    const run = flowsActionContributions()[0]!;
    // payload arrives already interpolated by the engine: ${{trigger}} resolved.
    expect(
      run.buildEvent!({
        payload: { flow: "invoicebot:process", inputs: { invoice: "/spool/inv-042.pdf", priority: 5, dry: true } },
        automation: {},
      }),
    ).toEqual({
      eventType: "flow:run",
      data: { flowName: "invoicebot:process", inputs: { invoice: "/spool/inv-042.pdf", priority: 5, dry: true } },
    });
    // task + inputs coexist
    expect(
      run.buildEvent!({ payload: { flow: "a:b", task: "label", inputs: { x: 1 } }, automation: {} }),
    ).toEqual({ eventType: "flow:run", data: { flowName: "a:b", task: "label", inputs: { x: 1 } } });
    // empty / non-object inputs omitted
    expect(run.buildEvent!({ payload: { flow: "a:b", inputs: {} }, automation: {} }))
      .toEqual({ eventType: "flow:run", data: { flowName: "a:b" } });
    expect(run.buildEvent!({ payload: { flow: "a:b", inputs: "nope" }, automation: {} }))
      .toEqual({ eventType: "flow:run", data: { flowName: "a:b" } });
  });

  it("flows.run rejects a malformed flow id (emits nothing)", () => {
    const run = flowsActionContributions()[0]!;
    expect(run.buildEvent!({ payload: { flow: "test:cap x", task: "t" }, automation: {} })).toBeNull();
    expect(run.buildEvent!({ payload: { flow: "nocolon", task: "t" }, automation: {} })).toBeNull();
    expect(run.buildEvent!({ payload: { flow: "" }, automation: {} })).toBeNull();
  });
});

describe("provideFlowsActions (pure publisher)", () => {
  it("publishes the contribution under automation.action.flows and consumes nothing", () => {
    const provide = vi.fn();
    provideFlowsActions(provide, () => {});
    expect(provide).toHaveBeenCalledTimes(1);
    const [key, value] = provide.mock.calls[0]!;
    expect(key).toBe(ACTION_CONTRIBUTION_KEY);
    expect(key).toBe("automation.action.flows");
    expect((value as Array<{ id: string }>).map((c) => c.id)).toEqual(["flows.run"]);
  });
});
