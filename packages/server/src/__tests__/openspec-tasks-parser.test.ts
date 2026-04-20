import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  parseTasksMarkdown,
  readTasks,
  toggleTask,
  NotFoundError,
  LineMismatchError,
  NotACheckboxError,
} from "../openspec-tasks.js";

describe("parseTasksMarkdown", () => {
  it("parses ticked + unticked mix and tracks groups", () => {
    const md = [
      "## 1. Setup",
      "",
      "- [ ] 1.1 Create module",
      "- [x] 1.2 Add dep",
      "",
      "## 2. Tests",
      "- [x] 2.1 Write vitest",
      "- [ ] 2.2 Write e2e",
    ].join("\n");
    const tasks = parseTasksMarkdown(md);
    expect(tasks).toEqual([
      { id: "1.1", text: "Create module", done: false, line: 3, group: "1. Setup" },
      { id: "1.2", text: "Add dep", done: true, line: 4, group: "1. Setup" },
      { id: "2.1", text: "Write vitest", done: true, line: 7, group: "2. Tests" },
      { id: "2.2", text: "Write e2e", done: false, line: 8, group: "2. Tests" },
    ]);
  });

  it("ignores unparseable lines without failing", () => {
    const md = [
      "## Misc",
      "- foo bar",
      "- [ ] 1.1 Valid task",
      "random text",
      "  - [ ] 1.2 Indented, not top-level",
      "- [x] 1.3 Another valid",
    ].join("\n");
    const tasks = parseTasksMarkdown(md);
    expect(tasks.map((t) => t.id)).toEqual(["1.1", "1.3"]);
    expect(tasks.map((t) => t.done)).toEqual([false, true]);
  });

  it("handles capital X as done", () => {
    const tasks = parseTasksMarkdown("## G\n- [X] 1.1 Done-uppercase");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].done).toBe(true);
  });

  it("handles CRLF line endings", () => {
    const md = "## 1. G\r\n- [ ] 1.1 Test\r\n- [x] 1.2 Done\r\n";
    const tasks = parseTasksMarkdown(md);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].group).toBe("1. G");
    expect(tasks[0].line).toBe(2);
    expect(tasks[1].done).toBe(true);
  });

  it("returns empty list for no tasks", () => {
    expect(parseTasksMarkdown("# Title\n\nJust prose.\n")).toEqual([]);
  });

  it("handles tasks without a preceding heading (empty group)", () => {
    const tasks = parseTasksMarkdown("- [ ] 1.1 Loose task");
    expect(tasks[0].group).toBe("");
  });
});

describe("readTasks + toggleTask (writer)", () => {
  let tmpDir: string;
  let changeDir: string;
  let tasksFile: string;
  const CWD_CHANGE = ["my-cwd-placeholder", "demo-change"] as const;

  const initialMd = [
    "## 1. Setup",
    "",
    "- [ ] 1.1 First task",
    "- [x] 1.2 Second task",
    "",
    "## 2. Docs",
    "- [ ] 2.1 Third task",
    "",
  ].join("\n");

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openspec-tasks-test-"));
    changeDir = path.join(tmpDir, "openspec", "changes", CWD_CHANGE[1]);
    fs.mkdirSync(changeDir, { recursive: true });
    tasksFile = path.join(changeDir, "tasks.md");
    fs.writeFileSync(tasksFile, initialMd, "utf-8");
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("readTasks returns parsed entries", async () => {
    const tasks = await readTasks(tmpDir, CWD_CHANGE[1]);
    expect(tasks.map((t) => t.id)).toEqual(["1.1", "1.2", "2.1"]);
  });

  it("readTasks throws NotFoundError when file is missing", async () => {
    await expect(readTasks(tmpDir, "does-not-exist")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("toggle ticks an unticked task and preserves other lines", async () => {
    const result = await toggleTask(tmpDir, CWD_CHANGE[1], "1.1", true, 3);
    expect(result.done).toBe(true);
    expect(result.id).toBe("1.1");
    expect(result.line).toBe(3);
    expect(result.group).toBe("1. Setup");

    const after = fs.readFileSync(tasksFile, "utf-8");
    const expected = initialMd.replace("- [ ] 1.1 First task", "- [x] 1.1 First task");
    expect(after).toBe(expected);
  });

  it("toggle unticks a ticked task", async () => {
    const result = await toggleTask(tmpDir, CWD_CHANGE[1], "1.2", false, 4);
    expect(result.done).toBe(false);
    const after = fs.readFileSync(tasksFile, "utf-8");
    expect(after).toBe(initialMd.replace("- [x] 1.2 Second task", "- [ ] 1.2 Second task"));
  });

  it("toggle raises LineMismatchError when line is already in the target state", async () => {
    // Line 4 is already done=true; requesting done=true again → mismatch
    await expect(toggleTask(tmpDir, CWD_CHANGE[1], "1.2", true, 4)).rejects.toBeInstanceOf(
      LineMismatchError,
    );
    // File untouched
    expect(fs.readFileSync(tasksFile, "utf-8")).toBe(initialMd);
  });

  it("toggle raises LineMismatchError when id does not match target line", async () => {
    await expect(toggleTask(tmpDir, CWD_CHANGE[1], "9.9", true, 3)).rejects.toBeInstanceOf(
      LineMismatchError,
    );
  });

  it("toggle raises LineMismatchError for out-of-range line", async () => {
    await expect(toggleTask(tmpDir, CWD_CHANGE[1], "1.1", true, 9999)).rejects.toBeInstanceOf(
      LineMismatchError,
    );
  });

  it("toggle raises NotACheckboxError when target line is a heading", async () => {
    // Line 1 is "## 1. Setup"
    await expect(toggleTask(tmpDir, CWD_CHANGE[1], "1.1", true, 1)).rejects.toBeInstanceOf(
      NotACheckboxError,
    );
  });

  it("toggle raises NotFoundError when file is absent", async () => {
    await expect(toggleTask(tmpDir, "missing", "1.1", true, 3)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("toggle writes atomically (no .tmp left behind)", async () => {
    await toggleTask(tmpDir, CWD_CHANGE[1], "1.1", true, 3);
    const files = fs.readdirSync(changeDir);
    expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);
  });

  it("toggle preserves byte-for-byte all other lines", async () => {
    const weirdMd =
      "# Title line\n\n## 1. Group\n- [ ] 1.1 Task one\n> quote line\n\n    indented code\n- [x] 1.2 Task two\n";
    fs.writeFileSync(tasksFile, weirdMd, "utf-8");
    await toggleTask(tmpDir, CWD_CHANGE[1], "1.1", true, 4);
    const after = fs.readFileSync(tasksFile, "utf-8");
    expect(after).toBe(weirdMd.replace("- [ ] 1.1 Task one", "- [x] 1.1 Task one"));
  });
});
