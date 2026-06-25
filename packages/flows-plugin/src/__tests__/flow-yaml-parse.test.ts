import { describe, it, expect } from "vitest";
import { parseFlowYaml, flowToMermaid } from "../client/flow-yaml-parse.js";

const YAML = `
name: invoice-research
steps:
  - id: extract
    type: agent
    agent: extractor
    blockedBy: []
    on_complete: validate-nav
  - id: validate-nav
    type: code
    blockedBy: [extract]
    on_error: park
  - id: approve
    type: code-decision
    blockedBy: [validate-nav]
    branches:
      auto: export
      rework: extract
  - id: export
    type: agent
    agent: exporter
    blockedBy: [approve]
`;

describe("parseFlowYaml", () => {
  it("parses steps + counts", () => {
    const flow = parseFlowYaml(YAML)!;
    expect(flow.name).toBe("invoice-research");
    expect(flow.counts.total).toBe(4);
    expect(flow.counts.agents).toBe(2); // extract, export
    expect(flow.counts.code).toBe(2); // validate-nav, approve
    expect(flow.steps.find((s) => s.id === "approve")?.branches).toEqual({ auto: "export", rework: "extract" });
  });

  it("returns null on invalid YAML / no steps", () => {
    expect(parseFlowYaml(":::not yaml:::")).toBeNull();
    expect(parseFlowYaml("name: x")).toBeNull();
  });

  it("defaults missing type to agent", () => {
    const flow = parseFlowYaml("steps:\n  - id: a\n    blockedBy: []")!;
    expect(flow.steps[0].type).toBe("agent");
  });
});

describe("flowToMermaid", () => {
  it("emits graph LR with node shapes + forward and backward edges", () => {
    const flow = parseFlowYaml(YAML)!;
    const m = flowToMermaid(flow);
    expect(m.startsWith("graph LR")).toBe(true);
    expect(m).toContain('validate-nav[["⌗ validate-nav"]]'); // code shape
    expect(m).toContain('approve{"◈ approve"}'); // code-decision shape
    expect(m).toContain("extract --> validate-nav"); // forward edge from blockedBy
    expect(m).toContain("approve -->|auto| export"); // forward branch
    expect(m).toContain('approve -. "rework ↺" .-> extract'); // backward branch (loop)
  });
});
