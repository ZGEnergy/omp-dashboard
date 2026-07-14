/**
 * Thin wrapper around the official `omp config` CLI.
 *
 * Dashboard Settings mirrors OMP agent config (`~/.omp/agent/config.yml`)
 * exclusively through this surface — never by writing YAML in-process as the
 * primary write path. Spawns the omp binary directly (bun shebang); never
 * node-wraps omp's cli.js.
 */

import { resolveOmpAgentDir } from "@blackbelt-technology/pi-dashboard-shared/omp-agent-paths.js";
import { execFileAsync } from "@blackbelt-technology/pi-dashboard-shared/platform/exec.js";
import { getDefaultRegistry } from "@blackbelt-technology/pi-dashboard-shared/tool-registry/index.js";

export type OmpConfigValueType =
  | "boolean"
  | "number"
  | "string"
  | "enum"
  | "array"
  | "record";

export type OmpConfigEntry = {
  key: string;
  value: unknown;
  type: OmpConfigValueType;
  description: string;
};

export type OmpConfigCliErrorCode =
  | "OMP_NOT_FOUND"
  | "OMP_INVALID_KEY"
  | "OMP_CLI_FAILED";

export class OmpConfigCliError extends Error {
  readonly code: OmpConfigCliErrorCode;
  readonly exitCode?: number;
  readonly stderr?: string;

  constructor(
    code: OmpConfigCliErrorCode,
    message: string,
    opts?: { exitCode?: number; stderr?: string },
  ) {
    super(message);
    this.name = "OmpConfigCliError";
    this.code = code;
    this.exitCode = opts?.exitCode;
    this.stderr = opts?.stderr;
  }
}

export type ResolveOmpBin = () => string | null;

export type OmpConfigExecFile = (
  file: string,
  args: readonly string[],
  options: {
    encoding: "utf-8";
    timeout: number;
    maxBuffer: number;
    env: NodeJS.ProcessEnv;
  },
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

export interface OmpConfigCliOptions {
  resolveOmpBin?: ResolveOmpBin;
  execFile?: OmpConfigExecFile;
  /** Override for tests; defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export interface OmpConfigCli {
  path(): Promise<string>;
  list(): Promise<Record<string, OmpConfigEntry>>;
  get(key: string): Promise<OmpConfigEntry>;
  set(key: string, value: unknown): Promise<OmpConfigEntry>;
  reset(key: string): Promise<OmpConfigEntry>;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BUFFER = 20 * 1024 * 1024;

function defaultResolveOmpBin(): string | null {
  const override = process.env.OMP_BIN?.trim();
  if (override) return override;

  try {
    const registry = getDefaultRegistry();
    const res = registry.resolve("pi");
    // Only accept a direct binary path (omp launcher). Never return node or a
    // legacy pi *.js entry — node-wrapping omp's bun-only cli.js fails.
    if (res.ok && res.path && !/\.(?:js|cjs|mjs)$/i.test(res.path)) {
      const base = res.path.split(/[/\\]/).pop()?.toLowerCase() ?? "";
      if (base === "node" || base === "node.exe") return null;
      return res.path;
    }
  } catch {
    /* fall through */
  }
  return null;
}
function encodeSetValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new OmpConfigCliError("OMP_CLI_FAILED", `Invalid number value: ${value}`);
    }
    return String(value);
  }
  if (typeof value === "string") return value;
  // array / record — single argv element
  return JSON.stringify(value);
}

function toText(buf: string | Buffer): string {
  return typeof buf === "string" ? buf : buf.toString("utf-8");
}

function classifyCliFailure(
  err: unknown,
  stderr: string,
): OmpConfigCliError {
  const e = err as {
    code?: string;
    status?: number;
    exitCode?: number;
    message?: string;
    stdout?: string | Buffer;
    stderr?: string | Buffer;
  };
  const exitCode = e.exitCode ?? e.status;
  const errText = [
    stderr,
    e.message ?? "",
    e.stdout ? toText(e.stdout) : "",
    e.stderr ? toText(e.stderr) : "",
  ]
    .join("\n")
    .toLowerCase();

  if (
    e.code === "ENOENT" ||
    errText.includes("enoent") ||
    errText.includes("not found")
  ) {
    // Distinguish missing binary vs unknown key: ENOENT is binary; CLI
    // "Unknown setting" / "invalid key" is key error.
    if (e.code === "ENOENT") {
      return new OmpConfigCliError(
        "OMP_NOT_FOUND",
        "omp binary not found on PATH (set OMP_BIN if needed)",
        { exitCode, stderr },
      );
    }
  }

  if (
    errText.includes("unknown") ||
    errText.includes("invalid key") ||
    errText.includes("invalid setting") ||
    errText.includes("not a valid") ||
    errText.includes("no such setting")
  ) {
    return new OmpConfigCliError(
      "OMP_INVALID_KEY",
      stderr.trim() || e.message || "Invalid OMP config key",
      { exitCode, stderr },
    );
  }

  return new OmpConfigCliError(
    "OMP_CLI_FAILED",
    stderr.trim() || e.message || "omp config command failed",
    { exitCode, stderr },
  );
}

function normalizeListMap(
  raw: Record<string, { value?: unknown; type?: string; description?: string }>,
): Record<string, OmpConfigEntry> {
  const out: Record<string, OmpConfigEntry> = {};
  for (const [key, entry] of Object.entries(raw ?? {})) {
    out[key] = {
      key,
      value: entry?.value,
      type: (entry?.type as OmpConfigValueType) ?? "string",
      description: entry?.description ?? "",
    };
  }
  return out;
}

function normalizeEntry(raw: unknown, fallbackKey: string): OmpConfigEntry {
  if (!raw || typeof raw !== "object") {
    throw new OmpConfigCliError(
      "OMP_CLI_FAILED",
      `Unexpected omp config response for ${fallbackKey}`,
    );
  }
  const obj = raw as Record<string, unknown>;
  // An entry is usable only when CLI supplies schema metadata. Live `set` /
  // `reset --json` commonly return `{ key, value }`, so callers deliberately
  // fall back to `get` rather than fabricate type:string and lose metadata.
  if (typeof obj.type !== "string") {
    throw new OmpConfigCliError(
      "OMP_CLI_FAILED",
      `omp config response for ${fallbackKey} omitted type metadata`,
    );
  }
  return {
    key: typeof obj.key === "string" ? obj.key : fallbackKey,
    value: obj.value,
    type: obj.type as OmpConfigValueType,
    description: typeof obj.description === "string" ? obj.description : "",
  };
}

export function createOmpConfigCli(options: OmpConfigCliOptions = {}): OmpConfigCli {
  const resolveBin = options.resolveOmpBin ?? defaultResolveOmpBin;
  const execFile = options.execFile ?? execFileAsync;
  const env = options.env ?? process.env;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function run(args: string[]): Promise<string> {
    const bin = resolveBin();
    if (!bin) {
      throw new OmpConfigCliError(
        "OMP_NOT_FOUND",
        "omp binary not found on PATH (set OMP_BIN if needed)",
      );
    }
    try {
      const { stdout, stderr } = await execFile(bin, args, {
        encoding: "utf-8",
        timeout: timeoutMs,
        maxBuffer: MAX_BUFFER,
        env: { ...env },
      });
      const errText = toText(stderr).trim();
      // Some CLIs write warnings to stderr while succeeding; only treat as
      // failure when stdout is empty and stderr looks fatal (handled below).
      void errText;
      return toText(stdout);
    } catch (err) {
      const e = err as { stderr?: string | Buffer; stdout?: string | Buffer };
      const stderr = e.stderr ? toText(e.stderr) : "";
      throw classifyCliFailure(err, stderr);
    }
  }

  async function runJson(args: string[]): Promise<unknown> {
    const stdout = await run(args);
    const text = stdout.trim();
    if (!text) {
      throw new OmpConfigCliError("OMP_CLI_FAILED", "omp config returned empty output");
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new OmpConfigCliError(
        "OMP_CLI_FAILED",
        `Failed to parse omp config JSON: ${text.slice(0, 200)}`,
      );
    }
  }

  return {
    async path() {
      const out = (await run(["config", "path"])).trim();
      if (out) return out;
      return resolveOmpAgentDir({ agentDirEnv: env.PI_CODING_AGENT_DIR });
    },

    async list() {
      const raw = (await runJson(["config", "list", "--json"])) as Record<
        string,
        { value?: unknown; type?: string; description?: string }
      >;
      return normalizeListMap(raw);
    },

    async get(key: string) {
      const raw = await runJson(["config", "get", key, "--json"]);
      return normalizeEntry(raw, key);
    },

    async set(key: string, value: unknown) {
      const encoded = encodeSetValue(value);
      const raw = await runJson(["config", "set", key, encoded, "--json"]);
      // Prefer structured response; fall back to get when CLI returns bare ok.
      try {
        return normalizeEntry(raw, key);
      } catch {
        return this.get(key);
      }
    },

    async reset(key: string) {
      const raw = await runJson(["config", "reset", key, "--json"]);
      try {
        return normalizeEntry(raw, key);
      } catch {
        return this.get(key);
      }
    },
  };
}

/** Process-wide default instance (uses live PATH / OMP_BIN / registry). */
export const ompConfigCli = createOmpConfigCli();
