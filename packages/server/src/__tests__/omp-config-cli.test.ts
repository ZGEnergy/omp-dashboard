import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  createOmpConfigCli,
  OmpConfigCliError,
  type OmpConfigExecFile,
} from "../omp-config-cli.js";

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "fixtures",
      "omp-config-list.json",
    ),
    "utf-8",
  ),
);

function makeExec(handler: (file: string, args: readonly string[]) => unknown): OmpConfigExecFile {
  return async (file, args) => {
    const result = handler(file, args);
    if (result instanceof Error) throw result;
    if (typeof result === "object" && result && "throw" in (result as object)) {
      throw (result as { throw: Error }).throw;
    }
    return {
      stdout: typeof result === "string" ? result : JSON.stringify(result),
      stderr: "",
    };
  };
}


describe("createOmpConfigCli", () => {
  it("accepts successful CLI output without stderr", async () => {
    const cli = createOmpConfigCli({
      resolveOmpBin: () => "/usr/bin/omp",
      execFile: async () => ({ stdout: JSON.stringify(FIXTURE), stderr: undefined }),
    });

    await expect(cli.list()).resolves.toMatchObject({
      autoResume: { type: "boolean", value: false },
    });
  });
  it("uses OMP_BIN from the injected environment", async () => {
    const cli = createOmpConfigCli({
      env: { OMP_BIN: "/custom/omp" },
      execFile: makeExec((file, args) => {
        expect(file).toBe("/custom/omp");
        expect(args).toEqual(["config", "list", "--json"]);
        return FIXTURE;
      }),
    });

    await expect(cli.list()).resolves.toHaveProperty("autoResume");
  });


  it("list normalizes fixture map into keyed entries", async () => {
    const cli = createOmpConfigCli({
      resolveOmpBin: () => "/usr/bin/omp",
      execFile: makeExec((_f, args) => {
        expect(args).toEqual(["config", "list", "--json"]);
        return FIXTURE;
      }),
    });
    const list = await cli.list();
    expect(list.autoResume).toMatchObject({
      key: "autoResume",
      type: "boolean",
      value: false,
    });
    expect(list.modelRoles.type).toBe("record");
    expect(list.modelRoles.key).toBe("modelRoles");
  });

  it("get returns single entry", async () => {
    const cli = createOmpConfigCli({
      resolveOmpBin: () => "/usr/bin/omp",
      execFile: makeExec((_f, args) => {
        expect(args).toEqual(["config", "get", "hideThinkingBlock", "--json"]);
        return {
          key: "hideThinkingBlock",
          value: true,
          type: "boolean",
          description: "Hide thinking",
        };
      }),
    });
    const entry = await cli.get("hideThinkingBlock");
    expect(entry).toEqual({
      key: "hideThinkingBlock",
      value: true,
      type: "boolean",
      description: "Hide thinking",
    });
  });

  it("set encodes boolean/number/record values", async () => {
    const calls: string[][] = [];
    const cli = createOmpConfigCli({
      resolveOmpBin: () => "/usr/bin/omp",
      execFile: makeExec((_f, args) => {
        calls.push([...args]);
        return {
          key: args[2],
          value: args[3],
          type: "string",
          description: "",
        };
      }),
    });

    await cli.set("hideThinkingBlock", true);
    await cli.set("setupVersion", 2);
    await cli.set("modelRoles", { default: "xai/grok" });

    expect(calls[0]).toEqual([
      "config",
      "set",
      "hideThinkingBlock",
      "true",
      "--json",
    ]);
    expect(calls[1]).toEqual(["config", "set", "setupVersion", "2", "--json"]);
    expect(calls[2][0]).toBe("config");
    expect(calls[2][2]).toBe("modelRoles");
    expect(JSON.parse(calls[2][3])).toEqual({ default: "xai/grok" });
  });

  it("throws OMP_NOT_FOUND when binary missing", async () => {
    const cli = createOmpConfigCli({
      resolveOmpBin: () => null,
    });
    await expect(cli.list()).rejects.toMatchObject({ code: "OMP_NOT_FOUND" });
  });

  it("maps unknown-key stderr to OMP_INVALID_KEY", async () => {
    const err = Object.assign(new Error("Command failed"), {
      exitCode: 1,
      stderr: "Unknown setting: not.a.real.key",
    });
    const cli = createOmpConfigCli({
      resolveOmpBin: () => "/usr/bin/omp",
      execFile: makeExec(() => {
        throw err;
      }),
    });
    await expect(cli.get("not.a.real.key")).rejects.toBeInstanceOf(OmpConfigCliError);
    await expect(cli.get("not.a.real.key")).rejects.toMatchObject({
      code: "OMP_INVALID_KEY",
    });
  });

  it("path returns trimmed stdout", async () => {
    const cli = createOmpConfigCli({
      resolveOmpBin: () => "/usr/bin/omp",
      execFile: makeExec((_f, args) => {
        expect(args).toEqual(["config", "path"]);
        return "/home/joe/.omp/agent\n";
      }),
    });
    await expect(cli.path()).resolves.toBe("/home/joe/.omp/agent");
  });
});
