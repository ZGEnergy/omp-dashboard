/**
 * Unit tests for `omp-agent-paths.ts`.
 */
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveOmpAgentDir, resolveOmpConfigYml } from "../omp-agent-paths.js";

describe("resolveOmpAgentDir", () => {
  const HOME = "/home/u";

  it("no-arg resolves to ~/.omp/agent", () => {
    expect(resolveOmpAgentDir({ homedir: HOME, agentDirEnv: "" })).toBe(
      path.join(HOME, ".omp", "agent"),
    );
  });

  it("honours { homedir } override without agentDirEnv", () => {
    expect(resolveOmpAgentDir({ homedir: "/fake/home", agentDirEnv: "" })).toBe(
      path.join("/fake/home", ".omp", "agent"),
    );
  });

  it("uses agentDirEnv when set", () => {
    expect(
      resolveOmpAgentDir({ homedir: HOME, agentDirEnv: "/custom/agent" }),
    ).toBe("/custom/agent");
  });

  it("blank agentDirEnv falls through to default", () => {
    expect(resolveOmpAgentDir({ homedir: HOME, agentDirEnv: "  " })).toBe(
      path.join(HOME, ".omp", "agent"),
    );
  });

  it("tilde agentDirEnv expands against homedir", () => {
    expect(resolveOmpAgentDir({ homedir: HOME, agentDirEnv: "~/agent" })).toBe(
      path.join(HOME, "agent"),
    );
  });

  it("bare ~ expands to homedir", () => {
    expect(resolveOmpAgentDir({ homedir: HOME, agentDirEnv: "~" })).toBe(HOME);
  });

  it("absolute path passes through", () => {
    expect(resolveOmpAgentDir({ homedir: HOME, agentDirEnv: "/abs/agent" })).toBe(
      "/abs/agent",
    );
  });

  it("no-arg without override uses os.homedir()", () => {
    // Isolate from a live PI_CODING_AGENT_DIR by forcing empty seam.
    expect(resolveOmpAgentDir({ agentDirEnv: "" })).toBe(
      path.join(os.homedir(), ".omp", "agent"),
    );
  });
});

describe("resolveOmpConfigYml", () => {
  it("appends config.yml under the agent dir", () => {
    expect(
      resolveOmpConfigYml({ homedir: "/home/u", agentDirEnv: "/custom/agent" }),
    ).toBe(path.join("/custom/agent", "config.yml"));
  });

  it("default path is ~/.omp/agent/config.yml", () => {
    expect(resolveOmpConfigYml({ homedir: "/home/u", agentDirEnv: "" })).toBe(
      path.join("/home/u", ".omp", "agent", "config.yml"),
    );
  });
});
