import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { gitignoreToRegex, loadGitignoreMatcher, searchFiles } from "../command-handler.js";

const cleanup: string[] = [];
afterAll(() => {
  for (const r of cleanup) rmSync(r, { recursive: true, force: true });
});

function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "searchfiles-comp-"));
  cleanup.push(root);
  for (const [f, content] of Object.entries(files)) {
    const full = join(root, f);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

describe("gitignoreToRegex", () => {
  it("bare name matches a segment anywhere", () => {
    const re = gitignoreToRegex("coverage")!;
    expect(re.test("coverage")).toBe(true);
    expect(re.test("pkg/coverage/report.html")).toBe(true);
    expect(re.test("src/app.ts")).toBe(false);
  });
  it("trailing slash is a directory pattern", () => {
    const re = gitignoreToRegex("dist/")!;
    expect(re.test("dist")).toBe(true);
    expect(re.test("packages/dist")).toBe(true);
  });
  it("glob star is segment-scoped", () => {
    const re = gitignoreToRegex("*.log")!;
    expect(re.test("debug.log")).toBe(true);
    expect(re.test("logs/x.log")).toBe(true);
  });
  it("drops comments and negations", () => {
    expect(gitignoreToRegex("# a comment")).toBeNull();
    expect(gitignoreToRegex("!keep.me")).toBeNull();
    expect(gitignoreToRegex("   ")).toBeNull();
  });
});

describe("loadGitignoreMatcher", () => {
  it("returns a match-nothing predicate when .gitignore is absent", () => {
    const root = makeTree({ "src/a.ts": "" });
    const isIgnored = loadGitignoreMatcher(root);
    expect(isIgnored("src/a.ts")).toBe(false);
  });
});

describe("searchFiles — .gitignore awareness (3.1)", () => {
  it("does not descend an ignored directory", () => {
    const root = makeTree({
      ".gitignore": "coverage/\n",
      "coverage/report.ts": "",
      "src/report.ts": "",
    });
    const paths = searchFiles(root, "report").map((f) => f.path);
    expect(paths).toContain("src/report.ts");
    expect(paths).not.toContain("coverage/report.ts");
  });

  it("missing .gitignore does not break the walk", () => {
    const root = makeTree({ "foo.ts": "" });
    expect(() => searchFiles(root, "foo")).not.toThrow();
    expect(searchFiles(root, "foo").map((f) => f.path)).toContain("foo.ts");
  });
});

describe("searchFiles — softened completeness budget (3.2)", () => {
  it("surfaces a match in a late top-level subtree beyond the old 4000 visit budget", () => {
    const files: Record<string, string> = {};
    // 42 top-level dirs × 100 files = 4200 entries — past the old MAX_VISITS=4000.
    for (let d = 0; d < 42; d++) {
      for (let f = 0; f < 100; f++) files[`dir${String(d).padStart(2, "0")}/file${f}.ts`] = "";
    }
    files["zztools/zzhelper.ts"] = "";
    const root = makeTree(files);
    const paths = searchFiles(root, "zzhelper").map((f) => f.path);
    expect(paths).toContain("zztools/zzhelper.ts");
  });

  it("surfaces a deeply-nested match beyond the old depth<=6 guard", () => {
    const root = makeTree({ "a/b/c/d/e/f/g/h/deepfile.ts": "" });
    const paths = searchFiles(root, "deepfile").map((f) => f.path);
    expect(paths).toContain("a/b/c/d/e/f/g/h/deepfile.ts");
  });
});

describe("searchFiles — optional regexp leaf (3.3)", () => {
  it("matches by regular expression when regex mode is on", () => {
    const root = makeTree({ "src/fooBarTest.ts": "", "src/other.ts": "" });
    const paths = searchFiles(root, "foo.*test", { regex: true }).map((f) => f.path);
    expect(paths).toContain("src/fooBarTest.ts");
    expect(paths).not.toContain("src/other.ts");
  });

  it("falls back to substring on an invalid pattern (no throw)", () => {
    const root = makeTree({ "src/foo(bar).ts": "", "src/baz.ts": "" });
    let paths: string[] = [];
    expect(() => {
      paths = searchFiles(root, "foo(", { regex: true }).map((f) => f.path);
    }).not.toThrow();
    // Degrades to a literal substring search for "foo(".
    expect(paths).toContain("src/foo(bar).ts");
  });
});
