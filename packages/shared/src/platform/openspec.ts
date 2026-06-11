/**
 * OpenSpec tool module — Recipe-based API for the openspec CLI.
 *
 * Replaces the ad-hoc spawnSync/execFile calls in `openspec-poller.ts`
 * with typed Recipes executed through the runner. The higher-level
 * `pollOpenSpec` / `pollOpenSpecAsync` functions remain in
 * `openspec-poller.ts` (they aggregate list + per-change status into
 * the dashboard's OpenSpecData shape) and now use these primitives.
 *
 * See change: platform-command-executor.
 */
import { run, unwrap, type Recipe, type Result } from "./runner.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const OPENSPEC_TIMEOUT = 10_000;
/** `openspec update` regenerates project skill files; allow more headroom. */
const OPENSPEC_UPDATE_TIMEOUT = 30_000;

interface WithCwd {
  cwd: string;
}

// Canonical workflow sets live in the browser-safe types module so client
// code can import them without pulling node:fs. Re-exported here for
// server-side call sites. See change: add-openspec-profile-settings.
export { CORE_WORKFLOWS, EXPANDED_WORKFLOWS } from "../types.js";

/** Parse JSON from stdout; returns null on parse failure. */
function parseJsonOrNull(out: string): unknown | null {
  const trimmed = out.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

// ── Recipes ─────────────────────────────────────────────────────────────────

export const OPENSPEC_LIST: Recipe<WithCwd, unknown | null> = {
  argv: () => ["openspec", "list", "--json"],
  parse: parseJsonOrNull,
  timeout: OPENSPEC_TIMEOUT,
};

export const OPENSPEC_STATUS: Recipe<WithCwd & { change: string }, unknown | null> = {
  argv: ({ change }) => ["openspec", "status", "--change", change, "--json"],
  parse: parseJsonOrNull,
  timeout: OPENSPEC_TIMEOUT,
};

/**
 * `openspec archive --completed` — bulk-archives all completed changes.
 * Stdout is human-readable (not JSON); callers typically don't parse it,
 * they just await success/failure.
 */
export const OPENSPEC_ARCHIVE_COMPLETED: Recipe<WithCwd, string> = {
  argv: () => ["openspec", "archive", "--completed"],
  parse: (out) => out,
  // Archive operations can be slow when many changes are processed.
  timeout: 30_000,
};

/**
 * `openspec config list --json` — returns the global workflow config
 * (profile / delivery / enabled workflow commands) for the calling user.
 * See change: redesign-session-card-and-composer (config-driven-workflow).
 */
export const OPENSPEC_CONFIG_LIST: Recipe<WithCwd, unknown | null> = {
  argv: () => ["openspec", "config", "list", "--json"],
  parse: parseJsonOrNull,
  timeout: OPENSPEC_TIMEOUT,
};

/**
 * `openspec config profile <preset>` — applies a named CLI profile preset.
 * Only `core` is a valid preset in openspec v1.3.x; `expanded`/`custom`
 * have no preset and are written as JSON instead.
 * See change: add-openspec-profile-settings.
 */
export const OPENSPEC_CONFIG_PROFILE: Recipe<WithCwd & { preset: string }, string> = {
  argv: ({ preset }) => ["openspec", "config", "profile", preset],
  parse: (out) => out,
  timeout: OPENSPEC_TIMEOUT,
};

/**
 * `openspec update` — regenerates a project's OpenSpec instruction / skill
 * files to match the current global config. Run per-cwd.
 * See change: add-openspec-profile-settings.
 */
export const OPENSPEC_UPDATE: Recipe<WithCwd, string> = {
  argv: () => ["openspec", "update"],
  parse: (out) => out,
  timeout: OPENSPEC_UPDATE_TIMEOUT,
};

export const OPENSPEC_RECIPES = {
  OPENSPEC_LIST,
  OPENSPEC_STATUS,
  OPENSPEC_ARCHIVE_COMPLETED,
  OPENSPEC_CONFIG_LIST,
  OPENSPEC_CONFIG_PROFILE,
  OPENSPEC_UPDATE,
} as const;

// ── Public API ──────────────────────────────────────────────────────────────

/** Run `openspec list --json` and return the parsed JSON, or null on failure. */
export function list(input: WithCwd): Result<unknown | null> {
  return run(OPENSPEC_LIST, input, { cwd: input.cwd });
}

/** Run `openspec status --change <name> --json` and return parsed JSON or null. */
export function status(input: WithCwd & { change: string }): Result<unknown | null> {
  return run(OPENSPEC_STATUS, input, { cwd: input.cwd });
}

/** Run `openspec archive --completed`. Returns raw stdout on success. */
export function archiveCompleted(input: WithCwd): Result<string> {
  return run(OPENSPEC_ARCHIVE_COMPLETED, input, { cwd: input.cwd });
}

/** Run `openspec config list --json`. Returns parsed JSON or null. */
export function configList(input: WithCwd): Result<unknown | null> {
  return run(OPENSPEC_CONFIG_LIST, input, { cwd: input.cwd });
}

export function configListOr(input: WithCwd, fallback: unknown | null = null): unknown | null {
  return unwrap(configList(input), fallback);
}

/** Run `openspec config profile <preset>`. Returns raw stdout on success. */
export function configProfile(input: WithCwd & { preset: string }): Result<string> {
  return run(OPENSPEC_CONFIG_PROFILE, input, { cwd: input.cwd });
}

export function configProfileOr(input: WithCwd & { preset: string }, fallback = ""): string {
  return unwrap(configProfile(input), fallback);
}

/** Run `openspec update` in a project cwd. Returns raw stdout on success. */
export function update(input: WithCwd): Result<string> {
  return run(OPENSPEC_UPDATE, input, { cwd: input.cwd });
}

export function updateOr(input: WithCwd, fallback = ""): string {
  return unwrap(update(input), fallback);
}

// ── Global config file write (expanded/custom path) ─────────────────────────

/** Resolve the global OpenSpec config file path (`~/.config/openspec/config.json`). */
export function openSpecConfigFilePath(): string {
  return path.join(os.homedir(), ".config", "openspec", "config.json");
}

export interface WriteOpenSpecConfigResult {
  success: boolean;
  error?: string;
}

/**
 * Atomically merge `{ profile, workflows }` into the global config file,
 * preserving all other keys (delivery, telemetry, featureFlags). Writes to a
 * temp file in the same directory then `rename()`s over the target so a
 * concurrent reader never observes a partial file; a failed write leaves the
 * original intact. See change: add-openspec-profile-settings.
 */
export function writeOpenSpecConfigFile(partial: {
  profile: string;
  workflows: string[];
}): WriteOpenSpecConfigResult {
  const file = openSpecConfigFilePath();
  const dir = path.dirname(file);
  try {
    let existing: Record<string, unknown> = {};
    try {
      const raw = fs.readFileSync(file, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") existing = parsed as Record<string, unknown>;
    } catch {
      // No existing file / unreadable — start from empty, preserve nothing.
    }

    const merged = {
      ...existing,
      profile: partial.profile,
      workflows: [...partial.workflows],
    };

    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `.config.json.tmp-${process.pid}-${Date.now()}`);
    fs.writeFileSync(tmp, JSON.stringify(merged, null, 2) + "\n");
    try {
      fs.renameSync(tmp, file);
    } catch (err) {
      try { fs.unlinkSync(tmp); } catch { /* best effort */ }
      throw err;
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "write failed" };
  }
}

/**
 * Stable, order-independent signature of a workflow set. Used to detect
 * per-cwd staleness: a project is up-to-date when its recorded signature
 * equals the current global config's signature.
 * See change: add-openspec-profile-settings.
 */
export function workflowSetSignature(workflows: string[]): string {
  const normalized = Array.from(new Set(workflows.map((w) => w.trim()).filter(Boolean))).sort();
  return crypto.createHash("sha256").update(normalized.join("\n")).digest("hex").slice(0, 16);
}

// ── Best-effort variants (mirror the pattern established in git.ts) ─────────

export function listOr(input: WithCwd, fallback: unknown | null = null): unknown | null {
  return unwrap(list(input), fallback);
}

export function statusOr(
  input: WithCwd & { change: string },
  fallback: unknown | null = null,
): unknown | null {
  return unwrap(status(input), fallback);
}
