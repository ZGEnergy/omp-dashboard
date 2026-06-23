// Config layering (design §7): project `.pi/dashboard/knowledge_base.json`
// → global `~/.pi/dashboard/knowledge_base.json` → built-in defaults.
// Project file is used whole; absent fields fall back to global, then defaults.
// No file-count cap by default (requirement #1).
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export interface SourceConfig {
  kind?: "filesystem" | "npm" | "git" | "https"; // Phase 1 implements filesystem
  ref: string;
  priority?: number;
  subdir?: string;
}
export interface KbConfig {
  sources: SourceConfig[];
  roots?: Array<{ path: string; priority?: number }>; // legacy alias → filesystem sources
  include: string[];
  exclude: string[];
  extensions: string[];
  maxFileCount: number | null;
  maxDepth: number | null;
  respectGitignore: boolean;
  tokenizer: string;
  trigram: boolean;
  indexAgentsFiles: boolean;
  includeSourceMarkdown: boolean;
  dbPath: string;
}

export interface ResolvedSource {
  id: string; // stored on chunks.root
  dir: string; // absolute
  priority: number;
}
export interface ResolvedConfig extends KbConfig {
  cwd: string;
  dbAbsPath: string;
  resolvedSources: ResolvedSource[];
  origin: "project" | "global" | "defaults";
}

export const DEFAULTS: KbConfig = {
  sources: [],
  include: ["**/*.md"],
  exclude: ["**/node_modules/**", "**/archive/**"],
  extensions: [".md"],
  maxFileCount: null, // no cap
  maxDepth: null,
  respectGitignore: true,
  tokenizer: "porter unicode61",
  trigram: false,
  indexAgentsFiles: true,
  includeSourceMarkdown: true,
  dbPath: ".pi/dashboard/kb/index.db",
};

export function projectConfigPath(cwd: string): string {
  return join(cwd, ".pi", "dashboard", "knowledge_base.json");
}
export function globalConfigPath(): string {
  return join(homedir(), ".pi", "dashboard", "knowledge_base.json");
}

function readJson(path: string): Partial<KbConfig> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Partial<KbConfig>;
  } catch (e) {
    throw new Error(`invalid KB config at ${path}: ${(e as Error).message}`);
  }
}

/** Merge: defaults < global < project (field-level fill-in). */
export function loadConfig(cwd: string, opts: { configPath?: string } = {}): ResolvedConfig {
  const project = opts.configPath ? readJson(opts.configPath) : readJson(projectConfigPath(cwd));
  const global = readJson(globalConfigPath());
  const origin: ResolvedConfig["origin"] = project ? "project" : global ? "global" : "defaults";
  const merged: KbConfig = { ...DEFAULTS, ...(global ?? {}), ...(project ?? {}) };

  // legacy roots[] → filesystem sources
  const fromRoots = (merged.roots ?? []).map((r) => ({ kind: "filesystem" as const, ref: r.path, priority: r.priority }));
  const allSources = [...fromRoots, ...merged.sources];

  const resolvedSources: ResolvedSource[] = allSources
    .filter((s) => (s.kind ?? "filesystem") === "filesystem")
    .map((s) => {
      const base = isAbsolute(s.ref) ? s.ref : resolve(cwd, s.ref);
      return { id: s.ref, dir: s.subdir ? join(base, s.subdir) : base, priority: s.priority ?? 0 };
    });

  const dbAbsPath = isAbsolute(merged.dbPath) ? merged.dbPath : resolve(cwd, merged.dbPath);
  return { ...merged, cwd, dbAbsPath, resolvedSources, origin };
}
