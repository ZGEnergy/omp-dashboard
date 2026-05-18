/**
 * Integration test for the dashboard server's client static-file resolution
 * chain. Exercises every strategy in `resolveClientDir` against synthetic
 * filesystem layouts.
 *
 * Order contract: **durable paths first, volatile (scope-dir) paths after.**
 * The managed-dir candidate — originally appended as strategy #6 in
 * streamline-electron-bootstrap-and-recovery (Failure 2) — was promoted
 * to strategy #1 in fix-resolve-client-dir-prefers-durable-managed-path
 * because the scope-dir candidates resolve to a `node_modules/` subtree
 * that the bootstrap npm-install wipes after the server has already
 * registered fastifyStatic with the doomed path as `root`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveClientDir } from "../resolve-client-dir.js";

function plantIndexHtml(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><html></html>");
}

describe("resolveClientDir (static client resolution chain)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "client-resolve-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("picks strategy #1 (Node module resolver) when web package resolves", () => {
    const serverDir = path.join(tmp, "server", "src");
    fs.mkdirSync(serverDir, { recursive: true });

    const webPkgDir = path.join(tmp, "web-pkg");
    fs.mkdirSync(webPkgDir);
    fs.writeFileSync(path.join(webPkgDir, "package.json"), "{}");
    plantIndexHtml(path.join(webPkgDir, "dist"));

    const { clientDir } = resolveClientDir({
      serverDir,
      resolveWebPackage: () => path.join(webPkgDir, "package.json"),
    });
    expect(clientDir).toBe(path.join(webPkgDir, "dist"));
  });

  it("falls back to strategy #2 (scoped sibling) when web package fails", () => {
    // Layout: <tmp>/node_modules/@blackbelt-technology/{pi-dashboard-server/src, pi-dashboard-web/dist}.
    const serverDir = path.join(
      tmp,
      "node_modules",
      "@blackbelt-technology",
      "pi-dashboard-server",
      "src",
    );
    fs.mkdirSync(serverDir, { recursive: true });
    plantIndexHtml(
      path.join(
        tmp,
        "node_modules",
        "@blackbelt-technology",
        "pi-dashboard-web",
        "dist",
      ),
    );

    const { clientDir } = resolveClientDir({
      serverDir,
      resolveWebPackage: () => null,
    });
    expect(clientDir).toContain(
      path.join("@blackbelt-technology", "pi-dashboard-web", "dist"),
    );
  });

  it("picks strategy #1 (managed-dir root) when scope-dir is wiped but `.version` + canonical client present", () => {
    // Simulate the Failure 2 scenario: post-`npm install` wipe.
    // managed-dir at <tmp>/managed, .version marker, no @blackbelt-technology/ scope dir.
    const managed = path.join(tmp, "managed");
    fs.mkdirSync(managed);
    fs.writeFileSync(path.join(managed, ".version"), "1.2.3\n");
    plantIndexHtml(path.join(managed, "packages", "dist", "client"));

    // Server runs from the canonical extracted location.
    const serverDir = path.join(
      managed,
      "node_modules",
      "@blackbelt-technology",
      "pi-dashboard-server",
      "src",
    );
    fs.mkdirSync(serverDir, { recursive: true });

    const { clientDir, candidates } = resolveClientDir({
      serverDir,
      resolveWebPackage: () => null,
    });
    expect(clientDir).toBe(path.join(managed, "packages", "dist", "client"));
    // Managed-dir candidate is now FIRST (durable-paths-first contract).
    expect(candidates[0]).toBe(
      path.join(managed, "packages", "dist", "client"),
    );
  });

  it("prefers durable managed-root over volatile scope-dir even when both resolve", () => {
    // Live failure mode pinned by fix-resolve-client-dir-prefers-durable-managed-path:
    // at server boot, the scope-dir path EXISTS and would have won under the old
    // chain. The bootstrap npm-install wipes the scope dir minutes later, leaving
    // fastifyStatic stranded on a deleted root. With durable-first ordering, the
    // resolver picks the managed path that survives the wipe.
    const managed = path.join(tmp, "managed");
    fs.mkdirSync(managed);
    fs.writeFileSync(path.join(managed, ".version"), "1.2.3\n");

    // Both targets exist at resolution time.
    const scopeWebDist = path.join(
      managed,
      "node_modules",
      "@blackbelt-technology",
      "pi-dashboard-web",
      "dist",
    );
    plantIndexHtml(scopeWebDist);
    const durableClientDist = path.join(managed, "packages", "dist", "client");
    plantIndexHtml(durableClientDist);

    const serverDir = path.join(
      managed,
      "node_modules",
      "@blackbelt-technology",
      "pi-dashboard-server",
      "src",
    );
    fs.mkdirSync(serverDir, { recursive: true });

    const { clientDir, candidates } = resolveClientDir({
      serverDir,
      // The node-module-resolver strategy WOULD succeed if reached.
      resolveWebPackage: () => path.join(scopeWebDist, "..", "package.json"),
    });

    // Durable path wins, scope-dir loses.
    expect(clientDir).toBe(durableClientDist);
    expect(candidates[0]).toBe(durableClientDist);
    // Scope-dir path still appears in the chain (so future investigators see
    // it WAS reachable) just not first.
    expect(candidates).toContain(scopeWebDist);
    expect(candidates.indexOf(durableClientDist)).toBeLessThan(
      candidates.indexOf(scopeWebDist),
    );
  });

  it("returns empty clientDir when no candidate has index.html", () => {
    const serverDir = path.join(tmp, "nowhere", "src");
    fs.mkdirSync(serverDir, { recursive: true });

    const { clientDir, candidates } = resolveClientDir({
      serverDir,
      resolveWebPackage: () => null,
    });
    expect(clientDir).toBe("");
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("does NOT include the managed-dir candidate when no `.version` marker is found", () => {
    const serverDir = path.join(tmp, "deep", "src");
    fs.mkdirSync(serverDir, { recursive: true });

    const { candidates } = resolveClientDir({
      serverDir,
      resolveWebPackage: () => null,
    });
    // Without a marker, the chain length is exactly the 4 path-arithmetic
    // strategies (the managed-dir candidate is only added when `.version`
    // walkup succeeds).
    expect(candidates.length).toBe(4);
  });
});
