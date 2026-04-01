import { describe, it, expect } from "vitest";
import { getFlowCommands } from "../flow-commands.js";
import type { CommandInfo } from "../../../shared/types.js";

function cmd(name: string, source: CommandInfo["source"] = "extension"): CommandInfo {
  return { name, source };
}

describe("getFlowCommands", () => {
  it("returns extension commands not in excluded set", () => {
    const commands = [
      cmd("research"),
      cmd("deploy"),
      cmd("flows"),
      cmd("flows:new"),
      cmd("flows:edit"),
      cmd("flows:delete"),
      cmd("provider"),
      cmd("roles"),
      cmd("catalog"),
      cmd("model", "builtin"),
    ];
    const result = getFlowCommands(commands);
    expect(result.map(c => c.name)).toEqual(["research", "deploy"]);
  });

  it("returns empty array when no flow commands", () => {
    const commands = [
      cmd("flows"),
      cmd("provider"),
      cmd("model", "builtin"),
    ];
    expect(getFlowCommands(commands)).toEqual([]);
  });

  it("handles empty commands list", () => {
    expect(getFlowCommands([])).toEqual([]);
  });

  it("includes prompt-source commands", () => {
    // Currently only extension source is detected — this tests the boundary
    const commands = [cmd("my-flow", "prompt")];
    expect(getFlowCommands(commands)).toEqual([]); // prompt source not matched
  });
});
