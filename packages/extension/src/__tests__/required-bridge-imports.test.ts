/**
 * Repo-level invariant: `packages/extension/src/bridge.ts` MUST keep the
 * import bindings that `initBridge` / factory load call by bare name.
 *
 * Merge residue has twice shipped bridge usage without the matching import
 * (`fix/missing-autoname-import`, `eafcfd12` / #27). A dropped binding is a
 * `ReferenceError` at factory load. The factory catch used to log-and-swallow,
 * so dashboard-spawned sessions stayed alive, never sent `session_register`,
 * and the client only saw `spawn_register_timeout` after 30s.
 *
 * `tsc --noEmit` is the primary gate; this file pins the exact symbols that
 * already regressed so a partial import strip fails the unit suite even when
 * a sync commit skips the typecheck path.
 *
 * See change: fix-bridge-init-missing-imports.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

/**
 * Each entry: a bare identifier that must appear in a static import from the
 * listed module path (substring match on the import specifier).
 */
const REQUIRED: ReadonlyArray<{ symbol: string; from: string }> = [
  { symbol: "createAutoNamer", from: "./auto-session-namer.js" },
  { symbol: "extractFirstAssistantReply", from: "./bridge-context.js" },
  { symbol: "registerCanvasTool", from: "./canvas-tool.js" },
  { symbol: "buildSessionContextText", from: "./commit-draft-agent.js" },
  { symbol: "runForkSubagentDraft", from: "./commit-draft-agent.js" },
  { symbol: "EmptyActionableGuard", from: "./empty-actionable-guard.js" },
  { symbol: "SURFACE_MESSAGE", from: "./empty-actionable-guard.js" },
  { symbol: "resolveGuardConfig", from: "./empty-actionable-guard-config.js" },
  { symbol: "lookupRole", from: "./role-manager.js" },
  { symbol: "SubagentFrameBuffer", from: "./subagent-frame-buffer.js" },
  { symbol: "classifyTurnActionability", from: "./turn-actionability.js" },
  { symbol: "detectIsGitRepo", from: "./vcs-info.js" },
];

function importBlocks(src: string): string[] {
  // Collect each top-level import statement (single- or multi-line).
  const blocks: string[] = [];
  const re = /^import\s[\s\S]*?from\s+["'][^"']+["']\s*;/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    blocks.push(m[0]);
  }
  return blocks;
}

function blockImportsSymbol(block: string, symbol: string): boolean {
  // `import { Foo }` / `import { type Foo }` / `import { Foo as Bar }` — require
  // the identifier as an imported binding, not merely in a comment.
  const body = block.replace(/^import\s+type\s+/, "import ");
  // default / namespace imports: `import Foo from` / `import * as Foo from`
  if (new RegExp(`^import\\s+(?:\\*\\s+as\\s+)?${symbol}\\s+from\\b`).test(body)) {
    return true;
  }
  // named: look inside the first `{ ... }` before `from`
  const brace = body.match(/\{([^}]*)\}/);
  if (!brace) return false;
  return brace[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      // `type Foo` / `Foo` / `Foo as Bar` / `type Foo as Bar`
      const cleaned = part.replace(/^type\s+/, "");
      const name = cleaned.split(/\s+as\s+/)[0]?.trim();
      return name === symbol;
    });
}

describe("required bridge imports", () => {
  it("bridge.ts imports every symbol that previously dropped in merge residue", async () => {
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const bridgePath = path.resolve(here, "..", "bridge.ts");
    const src = await fs.readFile(bridgePath, "utf-8");
    const blocks = importBlocks(src);

    const missing: string[] = [];
    for (const { symbol, from } of REQUIRED) {
      const hit = blocks.some(
        (block) => block.includes(from) && blockImportsSymbol(block, symbol),
      );
      if (!hit) {
        missing.push(`${symbol} from "${from}"`);
      }
    }

    if (missing.length > 0) {
      expect.fail(
        `bridge.ts is missing required import binding(s):\n` +
          missing.map((m) => `  - ${m}`).join("\n") +
          `\n\n` +
          `Dropped imports crash initBridge with ReferenceError. Dashboard-` +
          `spawned sessions then never session_register and surface as ` +
          `spawn_register_timeout. Restore the import (see eafcfd12 / #27).`,
      );
    }

    expect(missing).toEqual([]);
  });

  it("dashboard-spawned factory catch fails loud on ReferenceError", async () => {
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const bridgePath = path.resolve(here, "..", "bridge.ts");
    const src = await fs.readFile(bridgePath, "utf-8");

    // Pin the fail-fast contract next to the swallow path so a future edit
    // cannot re-introduce log-only handling for dashboard-spawned init.
    expect(src).toContain("Bridge init failed:");
    expect(src).toMatch(/err\s+instanceof\s+ReferenceError/);
    expect(src).toMatch(/dashboardSpawnedAtFactory/);
    expect(src).toMatch(/process\.exit\(1\)/);
  });
});
