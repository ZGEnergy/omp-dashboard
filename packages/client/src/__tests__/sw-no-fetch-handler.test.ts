/**
 * Repo-level invariant: `public/sw.js` MUST NOT register a `fetch`
 * event listener. The dashboard is real-time; an SW that intercepts
 * fetches has no caching benefit (Vite fingerprints asset URLs) and
 * a documented failure mode (synthesised 5xx after re-deploy strands
 * users on stale assets with "HTTP ERROR 500 (from service worker)").
 *
 * If this test fails, restore the no-op SW contract instead of
 * re-introducing a fetch listener. See change:
 * fix-sw-strands-stale-assets.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

const FORBIDDEN_RE = /addEventListener\s*\(\s*["']fetch["']/;
const REQUIRED_TOKENS = [
  'addEventListener("install"',
  'addEventListener("activate"',
  "self.skipWaiting()",
  "caches.delete",
];

describe("public/sw.js contract", () => {
  it("does not register a fetch handler", async () => {
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, "..", "..", "..", "..");
    const swPath = path.resolve(repoRoot, "public/sw.js");
    const content = await fs.readFile(swPath, "utf-8");

    expect(
      FORBIDDEN_RE.test(content),
      `public/sw.js re-introduced a fetch listener.\n` +
        `Service workers in this app MUST NOT intercept requests; PWA install\n` +
        `criteria are satisfied by registration alone.\n` +
        `See openspec/changes/fix-sw-strands-stale-assets/.`,
    ).toBe(false);

    for (const token of REQUIRED_TOKENS) {
      expect(
        content.includes(token),
        `public/sw.js is missing required no-fetch-handler-contract token "${token}".`,
      ).toBe(true);
    }
  });
});
