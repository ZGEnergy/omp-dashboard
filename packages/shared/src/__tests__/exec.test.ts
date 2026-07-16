import { describe, expect, it } from "vitest";
import { execAsync, execFileAsync } from "../platform/exec.js";

describe("async exec wrappers", () => {
  it("execFileAsync preserves stdout and stderr", async () => {
    const result = await execFileAsync(process.execPath, [
      "-e",
      "process.stdout.write('stdout'); process.stderr.write('stderr');",
    ]);

    expect(result).toEqual({ stdout: "stdout", stderr: "stderr" });
  });

  it("execAsync preserves stdout and stderr", async () => {
    const result = await execAsync(
      `${JSON.stringify(process.execPath)} -e ${JSON.stringify("process.stdout.write('stdout'); process.stderr.write('stderr');")}`,
    );

    expect(result).toEqual({ stdout: "stdout", stderr: "stderr" });
  });
});
