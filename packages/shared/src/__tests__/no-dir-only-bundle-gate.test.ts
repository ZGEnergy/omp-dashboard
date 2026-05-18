/**
 * Repo-level invariant: `build-installer.sh` MUST NOT short-circuit the
 * `bundle-server.mjs` invocation purely on the existence of
 * `resources/server/node_modules`. That dir-only gate silently shipped stale
 * server source whenever `resources/server/` survived from a previous build.
 *
 * Replacement: content-staleness check via `.bundle-stamp` sentinel — see
 * `packages/electron/scripts/_bundle-stamp.mjs` and
 * openspec/changes/fix-build-installer-stale-server-bundle/.
 *
 * If this test fails, restore the staleness gate (`is_bundle_stale` /
 * `stale_reason` block) instead of re-introducing the dir-existence check.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

const FORBIDDEN_RE = /\[\s*!\s*-d\s+"\$ELECTRON_DIR\/resources\/server\/node_modules"\s*\]/;
const REQUIRED_TOKENS = [
  "is_bundle_stale",
  "stale_reason",
  ".bundle-stamp",
];

describe("build-installer.sh staleness gate", () => {
  it("does not gate bundle-server.mjs on dir-existence alone", async () => {
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, "..", "..", "..", "..");
    const scriptPath = path.resolve(
      repoRoot,
      "packages/electron/scripts/build-installer.sh",
    );
    const content = await fs.readFile(scriptPath, "utf-8");

    expect(
      FORBIDDEN_RE.test(content),
      `build-installer.sh re-introduced the dir-only bundle gate.\n` +
        `Use the staleness gate (is_bundle_stale + .bundle-stamp) instead.\n` +
        `See openspec/changes/fix-build-installer-stale-server-bundle/.`,
    ).toBe(false);

    for (const token of REQUIRED_TOKENS) {
      expect(
        content.includes(token),
        `build-installer.sh is missing required staleness-gate token "${token}".`,
      ).toBe(true);
    }
  });
});
