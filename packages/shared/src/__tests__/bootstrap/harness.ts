/**
 * In-memory bootstrap harness — pure-fs, pure-env test runner for
 * ToolRegistry resolution + bridge-extension registration scenarios.
 *
 * See openspec/changes/bootstrap-resolution-harness/design.md §7 for
 * the full design.
 *
 * Usage:
 *
 *   await withFakeEnv({
 *     platform: "win32",
 *     homedir:  "C:\\Users\\Robert",
 *     cwd:      "C:\\Program Files\\PI Dashboard",
 *     env:      { APPDATA: "C:\\Users\\Robert\\AppData\\Roaming", PATH: "..." },
 *     fs: layer(
 *       fixtures.npmGlobalOnWindows({ pi: "0.6.3" }),
 *       fixtures.managedInstall({ pi: "0.5.1" }),
 *     ),
 *   }, async (ctx) => {
 *     const registry = ctx.createRegistry();
 *     const res = registry.resolve("pi");
 *     expect(snapshotTrail(res, ctx)).toMatchSnapshot();
 *   });
 *
 * Invariants:
 * - No real fs, child_process, or network access during a scenario run.
 * - Every strategy dep (`exists`, `which`, `npmRootGlobal`, `resolveModule`)
 *   is wired to the in-memory volume.
 * - Platform is fully injected; tests do NOT mutate `process.platform`.
 */
import path from "node:path";
import posix from "node:path/posix";
import win32 from "node:path/win32";
import { Volume } from "memfs";
import type { IFs } from "memfs";
import {
  ToolRegistry,
  type ToolRegistryDeps,
  type PlatformEnv,
} from "../../tool-registry/registry.js";
import type { StrategyDeps } from "../../tool-registry/strategies.js";
import { OverridesStore } from "../../tool-registry/overrides.js";

/**
 * Minimal in-memory OverridesStore replacement that doesn't touch
 * the real filesystem. Shape-compatible with the real class (TS
 * `private` is erased at runtime, so casting through `unknown` is
 * safe).
 */
class FakeOverridesStore {
  constructor(private cache: Record<string, string>) {}
  list(): Readonly<Record<string, string>> {
    return this.cache;
  }
  set(name: string, overridePath: string): void {
    this.cache[name] = overridePath;
  }
  clear(name: string): void {
    delete this.cache[name];
  }
  invalidate(): void {
    /* cache is always fresh in the fake store */
  }
}

/** File contents for the fake filesystem: path -> content. Directories are
 * implied by the paths of their children. */
export type FsRecord = Readonly<Record<string, string | Buffer>>;

/** Env variables visible inside the scenario. */
export type FakeEnv = Readonly<Record<string, string>>;

export interface FakeEnvSpec {
  platform: NodeJS.Platform;
  homedir: string;
  cwd?: string;
  env?: FakeEnv;
  /** File contents — use `layer(...)` to compose fixtures. */
  fs?: FsRecord;
  /** Per-tool override map (tool-overrides.json content). */
  overrides?: Readonly<Record<string, string>>;
  /** Override `npm root -g`. Defaults to platform-appropriate path. */
  npmRootGlobal?: string;
}

export interface HarnessContext {
  readonly spec: FakeEnvSpec;
  readonly vol: Volume;
  readonly fs: IFs;
  readonly platform: NodeJS.Platform;
  readonly homedir: string;
  readonly cwd: string;
  readonly env: FakeEnv;
  /** Platform-correct `path` module (posix vs win32). */
  readonly pathlib: typeof posix | typeof win32;
  /** PATH entries as an array (split on platform-correct delimiter). */
  readonly pathEntries: readonly string[];
  /** Resolved `npm root -g` value. */
  readonly npmRootGlobal: string;

  /** Create the strategy deps wired to the fake filesystem/env. */
  createStrategyDeps(): Required<StrategyDeps>;

  /** Create a ToolRegistry pre-wired with the fake env + overrides. */
  createRegistry(extra?: Partial<ToolRegistryDeps>): ToolRegistry;

  /** Read the fake filesystem's settings.json (or null if absent/broken). */
  readSettings(): Record<string, unknown> | null;
}

/**
 * Merge multiple FsRecord layers. Later layers override earlier on path
 * conflict. Returns a single FsRecord.
 */
export function layer(...layers: readonly (FsRecord | undefined | null)[]): FsRecord {
  const out: Record<string, string | Buffer> = {};
  for (const l of layers) {
    if (!l) continue;
    for (const [k, v] of Object.entries(l)) out[k] = v;
  }
  return out;
}

/** Platform-aware PATH delimiter. */
function pathDelim(platform: NodeJS.Platform): string {
  return platform === "win32" ? ";" : ":";
}

/** Platform-correct path module. */
function pathFor(platform: NodeJS.Platform): typeof posix | typeof win32 {
  return platform === "win32" ? win32 : posix;
}

/** Default `npm root -g` per platform when not provided by spec. */
function defaultNpmRootGlobal(spec: FakeEnvSpec): string {
  const p = pathFor(spec.platform);
  if (spec.platform === "win32") {
    const appdata = spec.env?.APPDATA ?? p.join(spec.homedir, "AppData", "Roaming");
    return p.join(appdata, "npm", "node_modules");
  }
  return p.join(spec.homedir, ".npm", "lib", "node_modules");
}

/**
 * Build a `which(name)` function that walks PATH inside the fake fs.
 * On win32, tries `name`, `name.cmd`, `name.exe` in that order.
 */
function buildWhich(
  fs: IFs,
  pathEntries: readonly string[],
  platform: NodeJS.Platform,
): (name: string) => string | null {
  const p = pathFor(platform);
  const exts = platform === "win32" ? ["", ".cmd", ".exe", ".bat"] : [""];
  return (name: string): string | null => {
    // If name has an extension or absolute path, short-circuit.
    if (p.isAbsolute(name)) {
      return fs.existsSync(name) ? name : null;
    }
    for (const entry of pathEntries) {
      for (const ext of exts) {
        const candidate = p.join(entry, name + ext);
        try {
          if (fs.existsSync(candidate)) return candidate;
        } catch {
          /* ignore */
        }
      }
    }
    return null;
  };
}

/**
 * Build a `resolveModule(id, from)` that walks the fake fs' node_modules
 * ancestor chain starting at `from`, looking for
 *   <dir>/node_modules/<id>/package.json
 * then reading that package.json's `main`/`exports` to derive the entry.
 * When no package.json `main` is present, falls back to `index.js`.
 *
 * NOT a full Node resolver — covers the cases the bootstrap harness
 * needs (bare package import of CJS/ESM with a `main` field). Good
 * enough for pi-coding-agent, openspec, tsx.
 */
function buildResolveModule(
  fs: IFs,
  platform: NodeJS.Platform,
): (id: string, from: string) => string | null {
  const p = pathFor(platform);

  function readJson(p2: string): Record<string, unknown> | null {
    try {
      const raw = fs.readFileSync(p2, "utf-8") as string;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function entryFromPkg(pkgPath: string, pkg: Record<string, unknown>): string {
    const pkgDir = p.dirname(pkgPath);
    const main = typeof pkg.main === "string" ? pkg.main : "index.js";
    return p.join(pkgDir, main);
  }

  return (id: string, from: string): string | null => {
    // Normalize `from`: if it's a file:// URL, strip it.
    let anchor = from;
    if (anchor.startsWith("file://")) {
      // file:///C:/... on win32, file:///home/... on posix
      anchor = anchor.slice(platform === "win32" ? 8 : 7);
    }
    // Starting directory: if anchor is a file, use its dir; if it's already
    // a directory path, use as-is.
    let dir = anchor;
    try {
      const st = fs.statSync(dir);
      if (!st.isDirectory()) dir = p.dirname(dir);
    } catch {
      dir = p.dirname(anchor);
    }

    // Walk up looking for node_modules/<id>/package.json
    // Stop when we hit the filesystem root (dirname returns same value).
    let prev = "";
    while (dir !== prev) {
      const pkgPath = p.join(dir, "node_modules", id, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = readJson(pkgPath);
        if (pkg) {
          const entry = entryFromPkg(pkgPath, pkg);
          if (fs.existsSync(entry)) return entry;
        }
      }
      prev = dir;
      dir = p.dirname(dir);
    }
    return null;
  };
}

/**
 * Populate a memfs Volume from an FsRecord. Also creates directory
 * entries implicitly.
 */
function populateVolume(vol: Volume, records: FsRecord, platform: NodeJS.Platform): void {
  const p = pathFor(platform);
  for (const [rawPath, content] of Object.entries(records)) {
    // memfs internally uses posix — but its APIs accept win32 paths on
    // win32. For our purposes we normalize to posix for the Volume,
    // because memfs is posix-native. Tests use the platform-correct
    // path module via `ctx.pathlib` for path composition, and we
    // translate at volume-populate time.
    const normalized = platform === "win32" ? toMemfsPath(rawPath) : rawPath;
    const dir = posix.dirname(normalized);
    try {
      vol.mkdirSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
    vol.writeFileSync(normalized, content);
  }
  void p; // silence unused on some paths
}

/**
 * Translate a win32-style path to the posix-like path memfs uses internally.
 * e.g. `C:\Users\Robert\.pi\settings.json` → `/C:/Users/Robert/.pi/settings.json`.
 * Drive letter becomes a top-level directory. Separators flipped.
 */
export function toMemfsPath(winPath: string): string {
  const replaced = winPath.replace(/\\/g, "/");
  if (/^[A-Za-z]:/.test(replaced)) {
    return "/" + replaced;
  }
  return replaced.startsWith("/") ? replaced : "/" + replaced;
}

/**
 * Build a memfs-backed IFs that understands win32 paths by translating
 * them to posix-form keys inside the volume.
 */
function wrapFsForPlatform(vol: Volume, platform: NodeJS.Platform): IFs {
  const base = vol as unknown as IFs;
  if (platform !== "win32") return base;
  // Wrap: translate any incoming path through toMemfsPath.
  const translate = (p: unknown): unknown =>
    typeof p === "string" ? toMemfsPath(p) : p;
  const wrap = <K extends keyof IFs>(name: K): IFs[K] => {
    const orig = base[name] as unknown as (...args: unknown[]) => unknown;
    if (typeof orig !== "function") return base[name];
    return ((...args: unknown[]) => {
      if (args.length > 0) args[0] = translate(args[0]);
      return orig.apply(base, args);
    }) as unknown as IFs[K];
  };
  return new Proxy(base, {
    get(target, prop: string) {
      if (prop === "existsSync" || prop === "readFileSync" || prop === "statSync"
        || prop === "readdirSync" || prop === "writeFileSync" || prop === "mkdirSync"
        || prop === "rmSync" || prop === "lstatSync") {
        return wrap(prop as keyof IFs);
      }
      return (target as unknown as Record<string, unknown>)[prop];
    },
  }) as IFs;
}

/**
 * Run an async callback inside a fresh in-memory environment.
 *
 * Does NOT mutate `process.platform`, `process.env`, `process.cwd()`,
 * or any other host state — all environment surface is threaded through
 * `HarnessContext` and the `StrategyDeps` it produces.
 */
export async function withFakeEnv<T>(
  spec: FakeEnvSpec,
  fn: (ctx: HarnessContext) => Promise<T> | T,
): Promise<T> {
  const vol = new Volume();
  populateVolume(vol, spec.fs ?? {}, spec.platform);
  const fs = wrapFsForPlatform(vol, spec.platform);
  const pathlib = pathFor(spec.platform);
  const env = spec.env ?? {};
  const cwd = spec.cwd ?? spec.homedir;
  const pathVar = env.PATH ?? "";
  const pathEntries = pathVar === ""
    ? []
    : pathVar.split(pathDelim(spec.platform)).filter(Boolean);
  const npmRootGlobal = spec.npmRootGlobal ?? defaultNpmRootGlobal(spec);

  const whichFn = buildWhich(fs, pathEntries, spec.platform);
  const resolveModuleFn = buildResolveModule(fs, spec.platform);
  const existsFn = (p: string) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  };

  const createStrategyDeps = (): Required<StrategyDeps> => ({
    exists: existsFn,
    which: whichFn,
    npmRootGlobal: () => npmRootGlobal,
    resolveModule: resolveModuleFn,
  });

  const createRegistry = (extra?: Partial<ToolRegistryDeps>): ToolRegistry => {
    const overridesStore = new FakeOverridesStore({ ...(spec.overrides ?? {}) });
    const platformEnv: PlatformEnv = { homedir: spec.homedir, cwd };
    return new ToolRegistry({
      overrides: overridesStore as unknown as OverridesStore,
      platform: spec.platform,
      env: platformEnv,
      now: () => 0,
      ...extra,
    });
  };

  const readSettings = (): Record<string, unknown> | null => {
    const settingsPath = pathlib.join(spec.homedir, ".pi", "agent", "settings.json");
    try {
      const raw = fs.readFileSync(settingsPath, "utf-8") as string;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const ctx: HarnessContext = {
    spec,
    vol,
    fs,
    platform: spec.platform,
    homedir: spec.homedir,
    cwd,
    env,
    pathlib,
    pathEntries,
    npmRootGlobal,
    createStrategyDeps,
    createRegistry,
    readSettings,
  };

  return await fn(ctx);
}
