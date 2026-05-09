/**
 * Docker Compose orchestration for the self-hosted Honcho stack.
 *
 * See change: honcho-dashboard-plugin (spec honcho-server-lifecycle).
 */
import { spawn } from "@blackbelt-technology/pi-dashboard-shared/platform/exec.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderComposeYaml } from "./compose-template.js";
import type { HonchoPluginConfig, StorageBackend } from "../shared/types.js";

export const COMPOSE_PATH = path.join(os.homedir(), ".honcho", "docker-compose.yml");
export const COMPOSE_REGEN_PATH = COMPOSE_PATH + ".regenerated";

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Run a child process with timeout. Resolves with `exitCode` (130 on timeout).
 * Pure I/O wrapper — no business logic.
 */
export function runCommand(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: opts.env ?? process.env });
    let stdout = "";
    let stderr = "";
    let killed = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          killed = true;
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        }, opts.timeoutMs)
      : null;
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        exitCode: killed ? 130 : (code ?? 1),
        stdout,
        stderr,
      });
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: 127, stdout, stderr: stderr + String(err) });
    });
  });
}

// ── Compose-file management ─────────────────────────────────────────────────

export function ensureComposeFile(
  cfg: HonchoPluginConfig,
  composePath: string = COMPOSE_PATH,
): { written: boolean; path: string } {
  if (fs.existsSync(composePath)) return { written: false, path: composePath };
  fs.mkdirSync(path.dirname(composePath), { recursive: true });
  fs.writeFileSync(composePath, renderComposeYaml(cfg));
  return { written: true, path: composePath };
}

/** Pure helper — extract the (apiPort, dbPort, backend) currently encoded in a compose file. */
export function inspectComposeFile(composePath: string = COMPOSE_PATH): {
  apiPort: number | null;
  dbPort: number | null;
  backend: StorageBackend | null;
} {
  let body = "";
  try {
    body = fs.readFileSync(composePath, "utf-8");
  } catch {
    return { apiPort: null, dbPort: null, backend: null };
  }
  const apiMatch = body.match(/"(\d+):8000"/);
  const dbMatch = body.match(/"(\d+):5432"/);
  let backend: StorageBackend | null = null;
  if (body.includes("o: bind")) backend = "host-directory";
  else if (body.includes("honcho-pg: {}")) backend = "docker-volume";
  else if (body.includes("o: loop")) backend = "loop-image";
  return {
    apiPort: apiMatch ? Number(apiMatch[1]) : null,
    dbPort: dbMatch ? Number(dbMatch[1]) : null,
    backend,
  };
}

/**
 * Write `~/.honcho/docker-compose.yml.regenerated` if the requested config
 * implies different ports OR a different backend than the existing compose
 * file. Returns the regenerated path or `null` if no regen needed.
 */
export function regenerateComposeForChanges(
  cfg: HonchoPluginConfig,
  composePath: string = COMPOSE_PATH,
  regenPath: string = COMPOSE_REGEN_PATH,
): string | null {
  if (!fs.existsSync(composePath)) return null;
  const current = inspectComposeFile(composePath);
  const wantApi = cfg.selfHost?.apiPort ?? 8765;
  const wantDb = cfg.selfHost?.dbPort ?? 5455;
  const wantBackend: StorageBackend = cfg.selfHost?.storageBackend ?? "host-directory";
  const portsDiffer =
    (current.apiPort != null && current.apiPort !== wantApi) ||
    (current.dbPort != null && current.dbPort !== wantDb);
  const backendDiffers = current.backend != null && current.backend !== wantBackend;
  if (!portsDiffer && !backendDiffers) return null;
  fs.mkdirSync(path.dirname(regenPath), { recursive: true });
  fs.writeFileSync(regenPath, renderComposeYaml(cfg));
  return regenPath;
}

// ── Docker probes ────────────────────────────────────────────────────────────

export interface DetectDockerResult {
  available: boolean;
  error?: string;
}

export async function detectDocker(): Promise<DetectDockerResult> {
  const r = await runCommand("docker", ["version"], { timeoutMs: 5000 });
  if (r.exitCode === 0) return { available: true };
  return { available: false, error: r.stderr || `docker exit ${r.exitCode}` };
}

// ── Compose lifecycle ────────────────────────────────────────────────────────

export interface ComposeUpResult {
  ok: boolean;
  portConflict?: { port: number };
  error?: string;
}

const PORT_CONFLICT_RE = /(?:bind: address already in use|Bind for [^ ]+ failed: port is already allocated|listen tcp [^ ]+ bind:.*address already in use)/i;

export async function composeUp(
  composePath: string = COMPOSE_PATH,
): Promise<ComposeUpResult> {
  const r = await runCommand("docker", ["compose", "-f", composePath, "up", "-d"], {
    timeoutMs: 120_000,
  });
  if (r.exitCode === 0) return { ok: true };
  // Try to extract a port number out of the stderr.
  const portMatch = r.stderr.match(/(?:0\.0\.0\.0|127\.0\.0\.1|\[?::\]?):(\d+)/);
  if (PORT_CONFLICT_RE.test(r.stderr)) {
    return {
      ok: false,
      portConflict: { port: portMatch ? Number(portMatch[1]) : 0 },
      error: r.stderr.trim(),
    };
  }
  return { ok: false, error: (r.stderr || r.stdout || "").trim() };
}

export async function composeDown(
  composePath: string = COMPOSE_PATH,
): Promise<{ ok: boolean; error?: string }> {
  const r = await runCommand("docker", ["compose", "-f", composePath, "down"], {
    timeoutMs: 60_000,
  });
  if (r.exitCode === 0) return { ok: true };
  return { ok: false, error: (r.stderr || r.stdout || "").trim() };
}

export async function pollHealth(
  endpoint: string,
  budgetMs = 30_000,
  intervalMs = 1_000,
): Promise<{ ok: boolean; lastError?: string }> {
  const url = `${endpoint.replace(/\/$/, "")}/health`;
  const deadline = Date.now() + budgetMs;
  let lastError: string | undefined;
  while (Date.now() < deadline) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), intervalMs);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) return { ok: true };
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, lastError };
}

export async function runMigrations(
  composePath: string = COMPOSE_PATH,
): Promise<{ ok: boolean; error?: string }> {
  const r = await runCommand(
    "docker",
    ["compose", "-f", composePath, "exec", "-T", "api", "alembic", "upgrade", "head"],
    { timeoutMs: 120_000 },
  );
  if (r.exitCode === 0) return { ok: true };
  return { ok: false, error: (r.stderr || r.stdout || "").trim() };
}

/**
 * `docker inspect` the api container to read its runtime UID; used for the
 * pgdata UID-mismatch chown remediation (D9). Returns `null` when inspect
 * fails (no container running yet, or docker missing).
 */
export async function detectApiContainerUid(
  composePath: string = COMPOSE_PATH,
): Promise<number | null> {
  const list = await runCommand(
    "docker",
    ["compose", "-f", composePath, "ps", "-q", "api"],
    { timeoutMs: 5000 },
  );
  const id = list.stdout.trim();
  if (!id) return null;
  const inspect = await runCommand(
    "docker",
    ["inspect", "-f", "{{.Config.User}}", id],
    { timeoutMs: 5000 },
  );
  const raw = inspect.stdout.trim();
  if (!raw) return null;
  const n = Number(raw.split(":")[0]);
  return Number.isFinite(n) ? n : null;
}
