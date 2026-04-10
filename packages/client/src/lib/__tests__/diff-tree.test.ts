import { describe, it, expect } from "vitest";
import { buildFileTree } from "../diff-tree.js";
import type { FileDiffEntry } from "@blackbelt-technology/pi-dashboard-shared/diff-types.js";

function makeFile(path: string): FileDiffEntry {
  return { path, changes: [{ type: "write", timestamp: 1000 }] };
}

describe("buildFileTree", () => {
  it("should return empty array for empty input", () => {
    expect(buildFileTree([])).toEqual([]);
  });

  it("should create flat file nodes for root-level files", () => {
    const tree = buildFileTree([makeFile("foo.ts"), makeFile("bar.ts")]);
    expect(tree).toHaveLength(2);
    expect(tree[0].name).toBe("bar.ts");
    expect(tree[1].name).toBe("foo.ts");
    expect(tree.every((n) => !n.isDir)).toBe(true);
  });

  it("should group files under directory nodes", () => {
    const tree = buildFileTree([makeFile("src/a.ts"), makeFile("src/b.ts")]);
    expect(tree).toHaveLength(1);
    expect(tree[0].isDir).toBe(true);
    expect(tree[0].name).toBe("src");
    expect(tree[0].children).toHaveLength(2);
  });

  it("should sort directories before files", () => {
    const tree = buildFileTree([makeFile("z.ts"), makeFile("src/a.ts")]);
    expect(tree[0].isDir).toBe(true);
    expect(tree[0].name).toBe("src");
    expect(tree[1].name).toBe("z.ts");
  });

  it("should collapse single-child directory chains", () => {
    const tree = buildFileTree([makeFile("src/server/foo.ts")]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("src/server");
    expect(tree[0].isDir).toBe(true);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe("foo.ts");
  });

  it("should not collapse when directory has multiple children", () => {
    const tree = buildFileTree([
      makeFile("src/a.ts"),
      makeFile("src/b.ts"),
    ]);
    expect(tree[0].name).toBe("src");
    expect(tree[0].children).toHaveLength(2);
  });

  it("should handle deeply nested paths", () => {
    const tree = buildFileTree([makeFile("a/b/c/d.ts")]);
    expect(tree[0].name).toBe("a/b/c");
    expect(tree[0].children[0].name).toBe("d.ts");
  });

  it("should attach file entry to leaf nodes", () => {
    const file = makeFile("foo.ts");
    const tree = buildFileTree([file]);
    expect(tree[0].file).toBe(file);
  });
});
