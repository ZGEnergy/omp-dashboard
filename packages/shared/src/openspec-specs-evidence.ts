/**
 * Local-evidence override for the OpenSpec `specs` artifact.
 *
 * The `spec-driven` schema declares `specs/**\/*.md` as the `generates`
 * pattern for the `specs` artifact, and the openspec CLI marks the
 * artifact `done` whenever that glob matches anything. The dashboard's
 * mtime-gated cache, however, can momentarily stale on `specs: ready`
 * for multi-spec changes (see change:
 * fix-openspec-specs-mtime-gate-blind-spot — the watch set is now
 * extended to cover `specs/**`, but this override is the second line
 * of defence).
 *
 * This module computes a boolean "is specs satisfied locally?" from
 * file-system evidence the dashboard's cache might miss between polls.
 * It is consumed by:
 *
 *   1. `buildOpenSpecData` in `openspec-poller.ts` — promotes
 *      `artifacts[specs].status` from "ready" to "done" when at least
 *      one `specs/**\/*.md` file exists. Promote-only; specs-only;
 *      never demotes; never touches other artifacts.
 *
 * One rule:
 *
 *   any file matching `specs/**\/*.md` exists in the change folder
 *
 * The probe walks the `specs/` subtree once and short-circuits on the
 * first `*.md` it finds. Defensive: every fs call is wrapped in
 * try/catch and treated as "no match" on error.
 *
 * See change: fix-openspec-specs-mtime-gate-blind-spot.
 */

import { readdirSync } from "node:fs";
import path from "node:path";

/** Probe surface — kept tiny so unit tests can pass an in-memory stub. */
export interface SpecsEvidenceProbe {
  /** Returns true iff at least one `*.md` file exists under `<changeDir>/specs/`. */
  hasAnySpecFile(changeDir: string): boolean;
}

/** Pure rule evaluator. Single rule; short-circuits on first match. */
export function evaluateLocalSpecsSatisfaction(
  changeDir: string,
  probe: SpecsEvidenceProbe,
): boolean {
  return probe.hasAnySpecFile(changeDir);
}

/**
 * Production probe — backed by the real filesystem. Walks `<changeDir>/specs/`
 * iteratively, short-circuits on the first `*.md` file encountered. Every
 * `readdirSync` is wrapped in try/catch (handles ENOENT, permission errors,
 * symlink loops, and any unexpected fs error) and treated as "no match".
 */
export function createFsSpecsEvidenceProbe(): SpecsEvidenceProbe {
  return {
    hasAnySpecFile(changeDir: string): boolean {
      const root = path.join(changeDir, "specs");
      // Iterative DFS — no recursion to avoid stack overflow on pathological trees.
      const stack: string[] = [root];
      while (stack.length > 0) {
        const dir = stack.pop()!;
        let entries: import("node:fs").Dirent[];
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          // Missing dir, permission denied, or any other fs error — skip.
          continue;
        }
        for (const e of entries) {
          if (e.isFile() && e.name.endsWith(".md")) return true;
          if (e.isDirectory()) stack.push(path.join(dir, e.name));
        }
      }
      return false;
    },
  };
}
