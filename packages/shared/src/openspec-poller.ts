/**
 * Polls the openspec CLI to gather change data for the session's project.
 * Uses async child processes to avoid blocking the event loop.
 */
import { spawnSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import type { OpenSpecData, OpenSpecChange, OpenSpecArtifact } from "./types.js";

const execFileAsync = promisify(execFile);
const EMPTY_DATA: OpenSpecData = { initialized: false, changes: [] };

/** Synchronous version — only used by bridge extension where async isn't practical */
function runOpenSpecSync(args: string[], cwd: string): unknown | null {
  try {
    const result = spawnSync("openspec", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10_000,
    });
    if (result.status !== 0 || !result.stdout) return null;
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

/** Async version — non-blocking, used by server */
async function runOpenSpecAsync(args: string[], cwd: string): Promise<unknown | null> {
  try {
    const { stdout } = await execFileAsync("openspec", args, {
      cwd,
      encoding: "utf-8",
      timeout: 10_000,
    });
    if (!stdout) return null;
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function buildOpenSpecData(
  listResult: { changes?: Array<{ name: string; status: string; completedTasks: number; totalTasks: number }> } | null,
  statusResults: Map<string, { artifacts?: Array<{ id: string; status: string }> } | null>,
): OpenSpecData {
  if (!listResult || !Array.isArray(listResult.changes)) {
    return EMPTY_DATA;
  }

  const changes: OpenSpecChange[] = listResult.changes.map((c) => {
    const statusResult = statusResults.get(c.name) ?? null;
    const artifacts: OpenSpecArtifact[] = (statusResult?.artifacts ?? []).map((a) => ({
      id: a.id,
      status: (a.status === "done" ? "done" : a.status === "ready" ? "ready" : "blocked") as OpenSpecArtifact["status"],
    }));

    return {
      name: c.name,
      status: (c.status === "complete" ? "complete" : c.status === "in-progress" ? "in-progress" : "no-tasks") as OpenSpecChange["status"],
      completedTasks: c.completedTasks ?? 0,
      totalTasks: c.totalTasks ?? 0,
      artifacts,
    };
  });

  return { initialized: true, changes };
}

/** Synchronous poll — blocks event loop. Used by bridge extension. */
export function pollOpenSpec(cwd: string): OpenSpecData {
  const listResult = runOpenSpecSync(["list", "--json"], cwd) as any;
  if (!listResult || !Array.isArray(listResult.changes)) return EMPTY_DATA;

  const statusResults = new Map<string, any>();
  for (const c of listResult.changes) {
    statusResults.set(c.name, runOpenSpecSync(["status", "--change", c.name, "--json"], cwd));
  }
  return buildOpenSpecData(listResult, statusResults);
}

/** Async poll — non-blocking. Used by server directory service. */
export async function pollOpenSpecAsync(cwd: string): Promise<OpenSpecData> {
  const listResult = await runOpenSpecAsync(["list", "--json"], cwd) as any;
  if (!listResult || !Array.isArray(listResult.changes)) return EMPTY_DATA;

  // Run all status queries in parallel
  const entries = await Promise.all(
    listResult.changes.map(async (c: any): Promise<[string, any]> => {
      const status = await runOpenSpecAsync(["status", "--change", c.name, "--json"], cwd);
      return [c.name, status];
    }),
  );
  const statusResults = new Map<string, any>(entries);
  return buildOpenSpecData(listResult, statusResults);
}
