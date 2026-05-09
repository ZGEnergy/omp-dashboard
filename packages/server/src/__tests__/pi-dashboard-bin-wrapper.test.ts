/**
 * Tests for `packages/server/bin/pi-dashboard.mjs` — the published CLI
 * bin entry. Spawns the wrapper as a child process to exercise the
 * real jiti-resolution + re-exec behaviour.
 *
 * See change: replace-tsx-with-jiti.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const wrapperPath = path.resolve(here, "..", "..", "bin", "pi-dashboard.mjs");
const repoNodeModules = path.resolve(here, "..", "..", "..", "..", "node_modules");
const repoJitiRegister = path.join(repoNodeModules, "jiti", "lib", "jiti-register.mjs");

describe("bin/pi-dashboard.mjs wrapper", () => {
  beforeAll(() => {
    if (!existsSync(wrapperPath)) {
      throw new Error(`Wrapper missing at ${wrapperPath}`);
    }
  });

  it("exits 1 with install-hint when jiti cannot be resolved", () => {
    // Build an isolated anchor with NO node_modules tree — createRequire on
    // it will fail to resolve `jiti/package.json`, triggering the miss path.
    const tmp = mkdtempSync(path.join(tmpdir(), "pi-dashboard-bin-test-"));
    try {
      const fakeAnchor = path.join(tmp, "fake-anchor.js");
      writeFileSync(fakeAnchor, "// no-op anchor with no node_modules\n");

      // Spawn the wrapper. We override process.argv[1] indirectly by
      // invoking node with `<wrapper>` then forcing argv[1] to the fake
      // anchor via a tiny preamble — but the wrapper reads its OWN
      // process.argv[1] which is the wrapper path itself when invoked
      // directly. Strategy: copy the wrapper into the isolated tmp dir so
      // its argv[1] resolves there with no jiti adjacency.
      const isolatedWrapper = path.join(tmp, "pi-dashboard.mjs");
      const wrapperSrc = require("node:fs").readFileSync(wrapperPath, "utf-8");
      writeFileSync(isolatedWrapper, wrapperSrc);

      const result = spawnSync(process.execPath, [isolatedWrapper, "--version"], {
        encoding: "utf-8",
        env: { ...process.env, NODE_PATH: "" },
        timeout: 10_000,
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("pi-dashboard: cannot find jiti");
      expect(result.stderr).toContain("npm install -g @earendil-works/pi-coding-agent");
      // No tsx mention — proposal mandates no-fallback wrapper.
      expect(result.stderr).not.toMatch(/tsx/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("resolves jiti from process.argv[1] anchor and re-execs cli.ts", () => {
    // Repo root has jiti at node_modules/jiti — wrapper invoked with its
    // real path SHOULD walk createRequire(realpath(argv[1])) up into the
    // repo's node_modules and find jiti.
    if (!existsSync(repoJitiRegister)) {
      // CI / fresh clone without `npm install` — skip rather than fail.
      return;
    }

    // Use `status` — it's the only cli.ts subcommand that completes
    // cleanly without binding ports or starting the server. Successful
    // resolution + re-exec is observable as: (a) no jiti-miss error on
    // stderr, (b) exit 0, (c) status output mentions "Dashboard server".
    const result = spawnSync(process.execPath, [wrapperPath, "status"], {
      encoding: "utf-8",
      timeout: 30_000,
    });

    expect(result.stderr).not.toContain("pi-dashboard: cannot find jiti");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Dashboard server/i);
  });
});
