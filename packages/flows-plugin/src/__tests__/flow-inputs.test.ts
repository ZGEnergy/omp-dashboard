/**
 * Read-only flow input-schema reader tests.
 * See change: wire-flow-inputs-in-automation.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flowYamlPath, readFlowInputs } from "../server/flow-inputs.js";

function writeFlow(cwd: string, ns: string, name: string, yaml: string): void {
  const dir = path.join(cwd, ".omp", "flows", "flows", ns, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "flow.yaml"), yaml);
}

describe("readFlowInputs", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-inputs-"));
  });
  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("returns declared typed inputs", () => {
    writeFlow(
      cwd,
      "invoicebot",
      "process",
      `name: invoicebot:process\ninputs:\n  invoice: { type: string, required: true }\n  priority: { type: number }\nsteps: []\n`,
    );
    expect(readFlowInputs(cwd, "invoicebot:process")).toEqual([
      { name: "invoice", type: "string", required: true },
      { name: "priority", type: "number", required: false },
    ]);
  });

  it("returns [] for a flow with no inputs", () => {
    writeFlow(cwd, "x", "y", `name: x:y\nsteps: []\n`);
    expect(readFlowInputs(cwd, "x:y")).toEqual([]);
  });

  it("returns [] for a missing flow / unparseable id", () => {
    expect(readFlowInputs(cwd, "no:such")).toEqual([]);
    expect(readFlowInputs(cwd, "malformed-id")).toEqual([]);
  });

  it("skips invalid input rows, keeps valid ones", () => {
    writeFlow(
      cwd,
      "a",
      "b",
      `name: a:b\ninputs:\n  good: { type: boolean }\n  bad: { type: nonsense }\n  alsoBad: "notamapping"\nsteps: []\n`,
    );
    expect(readFlowInputs(cwd, "a:b")).toEqual([{ name: "good", type: "boolean", required: false }]);
  });

  it("does not write any flow file (read-only)", () => {
    writeFlow(cwd, "a", "b", `name: a:b\ninputs:\n  f: { type: string }\nsteps: []\n`);
    const p = flowYamlPath(cwd, "a:b")!;
    const before = fs.statSync(p).mtimeMs;
    readFlowInputs(cwd, "a:b");
    expect(fs.statSync(p).mtimeMs).toBe(before);
    // no stray files created under the flow dir
    expect(fs.readdirSync(path.dirname(p))).toEqual(["flow.yaml"]);
  });
});
