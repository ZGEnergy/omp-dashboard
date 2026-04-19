/**
 * Tests for the browse directory endpoint logic.
 */
import { describe, it, expect } from "vitest";
import { listDirectories } from "../browse.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// Monorepo: packages/server/src/__tests__ → repo root is 4 levels up.
// Pre-monorepo this was 3 levels (src/__tests__); updated for the current layout.
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");

describe("listDirectories", () => {
  it("should return directory entries for a valid path", async () => {
    const result = await listDirectories(REPO_ROOT);

    expect(result.current).toBe(REPO_ROOT);
    expect(result.parent).toBe(path.dirname(REPO_ROOT));
    expect(result.entries.length).toBeGreaterThan(0);

    // Should contain known subdirectories of the monorepo root
    const names = result.entries.map((e) => e.name);
    expect(names).toContain("packages");
    expect(names).toContain("node_modules");
  });

  it("should default to home directory when no path given", async () => {
    const result = await listDirectories();
    expect(result.current).toBe(os.homedir());
  });

  it("should return entries sorted alphabetically", async () => {
    const result = await listDirectories(REPO_ROOT);
    const names = result.entries.map((e) => e.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it("should exclude hidden directories", async () => {
    // Home dir typically has hidden dirs like .config, .cache
    const result = await listDirectories(os.homedir());
    const names = result.entries.map((e) => e.name);
    const hidden = names.filter((n) => n.startsWith("."));
    expect(hidden).toEqual([]);
  });

  it("should detect isGit flag for git repos", async () => {
    const parentDir = path.dirname(REPO_ROOT);
    const result = await listDirectories(parentDir);

    const projectEntry = result.entries.find(
      (e) => e.name === path.basename(REPO_ROOT)
    );
    expect(projectEntry).toBeDefined();
    expect(projectEntry!.isGit).toBe(true);
  });

  it("should detect isPi flag for pi projects", async () => {
    const parentDir = path.dirname(REPO_ROOT);
    const result = await listDirectories(parentDir);

    const projectEntry = result.entries.find(
      (e) => e.name === path.basename(REPO_ROOT)
    );
    expect(projectEntry).toBeDefined();
    expect(projectEntry!.isPi).toBe(true);
  });

  it("should return null parent for root directory", async () => {
    const result = await listDirectories("/");
    expect(result.parent).toBeNull();
  });

  it("should throw for non-existent directory", async () => {
    await expect(
      listDirectories("/nonexistent/path/that/does/not/exist")
    ).rejects.toThrow();
  });

  it("should cap entries at 200", async () => {
    // Can't easily create 200+ dirs, but test the logic path exists
    const result = await listDirectories(os.homedir());
    expect(result.entries.length).toBeLessThanOrEqual(200);
  });

  it("should only return directories, not files", async () => {
    const projectRoot = path.resolve(import.meta.dirname, "../../..");
    const result = await listDirectories(projectRoot);
    const names = result.entries.map((e) => e.name);
    // package.json is a file, should not appear
    expect(names).not.toContain("package.json");
    expect(names).not.toContain("tsconfig.json");
  });

  it("should include full path in each entry", async () => {
    const projectRoot = path.resolve(import.meta.dirname, "../../..");
    const result = await listDirectories(projectRoot);
    for (const entry of result.entries) {
      expect(entry.path).toBe(path.join(projectRoot, entry.name));
    }
  });

  it("should return the server's platform", async () => {
    const result = await listDirectories(REPO_ROOT);
    expect(result.platform).toBe(process.platform);
  });

  it("returns parent=null at the filesystem root", async () => {
    // Use whichever root is appropriate for the host: "/" on Unix, the
    // process's drive root on Windows. Previously this test only
    // exercised Unix; `isFilesystemRoot` covers both branches now.
    const root = process.platform === "win32"
      ? path.parse(process.cwd()).root    // e.g., "C:\\" or "B:\\"
      : "/";
    const result = await listDirectories(root);
    expect(result.parent).toBeNull();
  });
});
