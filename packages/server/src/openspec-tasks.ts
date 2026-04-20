/**
 * Parser + writer for an OpenSpec change's `tasks.md` file.
 *
 * `tasks.md` uses a rigid line-level format:
 *   ## 1. Group heading
 *   - [ ] 1.1 Task text
 *   - [x] 1.2 Done task
 *
 * We parse top-level `- [ ]` / `- [x]` lines only; anything else is ignored
 * (indented sublists, free-form prose, etc.).
 *
 * Writes rewrite exactly one line's checkbox marker and preserve everything
 * else byte-for-byte; atomic via write-then-rename.
 */
import fs from "node:fs/promises";
import path from "node:path";

export interface OpenSpecTask {
  /** e.g. "1.1", "8.3" */
  id: string;
  /** Text after the id, trimmed. */
  text: string;
  done: boolean;
  /** 1-indexed line number in `tasks.md` — used as an optimistic-concurrency token. */
  line: number;
  /** Nearest preceding `## ` heading text (without the leading "## "). Empty string if none. */
  group: string;
}

export class NotFoundError extends Error {
  readonly code = "NOT_FOUND" as const;
  constructor(message = "tasks.md not found") {
    super(message);
  }
}
export class LineMismatchError extends Error {
  readonly code = "LINE_MISMATCH" as const;
  constructor(message = "line mismatch") {
    super(message);
  }
}
export class NotACheckboxError extends Error {
  readonly code = "NOT_A_CHECKBOX" as const;
  constructor(message = "target line is not a checkbox") {
    super(message);
  }
}

// Top-level checkbox: allow a single leading `- ` with optional `[ ]`/`[x]`/`[X]`,
// followed by an id-like token (digits and dots) and remaining text.
const CHECKBOX_RE = /^- \[([ xX])\] +([0-9]+(?:\.[0-9]+)*)\s+(.*)$/;
const HEADING_RE = /^##\s+(.*)$/;

export function parseTasksMarkdown(content: string): OpenSpecTask[] {
  // Split on \n only; trailing \r is trimmed so we handle CRLF inputs too.
  const lines = content.split("\n");
  const out: OpenSpecTask[] = [];
  let currentGroup = "";
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const h = HEADING_RE.exec(line);
    if (h) {
      currentGroup = h[1].trim();
      continue;
    }
    const m = CHECKBOX_RE.exec(line);
    if (!m) continue;
    const done = m[1] === "x" || m[1] === "X";
    out.push({
      id: m[2],
      text: m[3].trim(),
      done,
      line: i + 1,
      group: currentGroup,
    });
  }
  return out;
}

function tasksMdPath(cwd: string, change: string): string {
  return path.join(cwd, "openspec", "changes", change, "tasks.md");
}

export async function readTasks(cwd: string, change: string): Promise<OpenSpecTask[]> {
  const p = tasksMdPath(cwd, change);
  let content: string;
  try {
    content = await fs.readFile(p, "utf-8");
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new NotFoundError();
    throw err;
  }
  return parseTasksMarkdown(content);
}

export async function toggleTask(
  cwd: string,
  change: string,
  id: string,
  done: boolean,
  line: number,
): Promise<OpenSpecTask> {
  const p = tasksMdPath(cwd, change);
  let content: string;
  try {
    content = await fs.readFile(p, "utf-8");
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new NotFoundError();
    throw err;
  }

  // Preserve original line endings by splitting on \n and tracking \r individually.
  const lines = content.split("\n");
  if (line < 1 || line > lines.length) throw new LineMismatchError();

  const idx = line - 1;
  const raw = lines[idx];
  const hadCR = raw.endsWith("\r");
  const bare = hadCR ? raw.slice(0, -1) : raw;

  const m = CHECKBOX_RE.exec(bare);
  if (!m) throw new NotACheckboxError();
  if (m[2] !== id) throw new LineMismatchError();

  const currentDone = m[1] === "x" || m[1] === "X";
  // Optimistic concurrency: the caller's `done` is the *target* state; the line
  // must currently hold the opposite state. If it already matches, we treat
  // that as a line-mismatch — the file changed under us.
  if (currentDone === done) throw new LineMismatchError();

  const marker = done ? "x" : " ";
  const rewritten = bare.replace(CHECKBOX_RE, `- [${marker}] ${m[2]} ${m[3]}`);
  lines[idx] = hadCR ? rewritten + "\r" : rewritten;

  const newContent = lines.join("\n");
  const tmp = p + ".tmp";
  await fs.writeFile(tmp, newContent, "utf-8");
  await fs.rename(tmp, p);

  return {
    id,
    text: m[3].trim(),
    done,
    line,
    group: findGroupForLine(lines, idx),
  };
}

function findGroupForLine(lines: string[], idx: number): string {
  for (let i = idx; i >= 0; i--) {
    const raw = lines[i];
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const h = HEADING_RE.exec(line);
    if (h) return h[1].trim();
  }
  return "";
}
