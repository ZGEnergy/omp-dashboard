/**
 * ensureBundledGitOnPath — prepend the bundled `resources/git/` tree to
 * `env.PATH` (and set `GIT_EXEC_PATH` / `SSL_CERT_FILE`) when the active
 * git source is "bundled" on Windows. Sibling to ensureWindowsSystemPath.
 *
 * Layout verified by the R1 CI spike (dugite-native v2.53.0-3):
 *   cmd/git.exe              git launcher
 *   usr/bin/sh.exe           POSIX shell (GNU bash under the name `sh`;
 *                            dugite-native ships NO bash.exe). pi's
 *                            `!`/`!!` call pi.exec("sh"), so this matches.
 *   <libdir>/bin             git core libs + DLLs. <libdir> is
 *                            arch-specific: `mingw64` on win32-x64,
 *                            `clangarm64` on win32-arm64.
 *   <libdir>/libexec/git-core   GIT_EXEC_PATH target
 *
 * sh.exe is a real copied binary (not a symlink), so it survives ZIP
 * extraction — also confirmed by the spike.
 *
 * This module is the ONLY place allowed to reference bundled-git paths
 * (enforced by no-hardcoded-bundled-git-paths.test.ts).
 *
 * See change: embed-git-bash-on-windows.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import type { GitSource } from "./select-git-source.js";

/** Arch-specific MinGW/Clang library dir names, in probe order. */
const GIT_LIBDIRS = ["mingw64", "clangarm64"] as const;

/** Relative path to the git launcher — the bundle's presence marker. */
const GIT_LAUNCHER_REL = path.win32.join("cmd", "git.exe");

export interface ResolveBundledGitDirOpts {
  /** Override `process.platform` for tests. */
  platform?: NodeJS.Platform;
  /** `process.resourcesPath` (Electron). Undefined outside Electron. */
  resourcesPath?: string;
  /** Extra candidate roots (e.g. a standalone server bundle dir). */
  candidates?: string[];
  /** Override `fs.existsSync` for tests. */
  exists?: (p: string) => boolean;
}

/**
 * Locate the bundled `resources/git/` directory. Returns the absolute
 * path when it exists and contains `cmd/git.exe`, else `null` (dev tree,
 * non-electron server, or mac/linux bundle with no git).
 */
export function resolveBundledGitDir(opts: ResolveBundledGitDirOpts = {}): string | null {
  const exists = opts.exists ?? existsSync;
  const join = path.win32.join;

  const roots: string[] = [];
  if (opts.resourcesPath) roots.push(join(opts.resourcesPath, "git"));
  for (const c of opts.candidates ?? []) roots.push(c);

  for (const root of roots) {
    if (exists(join(root, GIT_LAUNCHER_REL))) return root;
  }
  return null;
}

/**
 * Pick the arch-specific lib dir (`mingw64` / `clangarm64`) under the
 * bundled git root, or `null` when neither exists.
 */
function resolveLibDir(gitDir: string, exists: (p: string) => boolean): string | null {
  for (const name of GIT_LIBDIRS) {
    if (exists(path.win32.join(gitDir, name))) return name;
  }
  return null;
}

export interface EnsureBundledGitOpts {
  /** Override `process.platform` for tests. */
  platform?: NodeJS.Platform;
  /**
   * Resolved active source. No-op unless "bundled". Callers pass the
   * cached `getActiveGitSource()` value.
   */
  source?: GitSource;
  /**
   * Bundled git root (…/resources/git). When omitted, resolved via
   * {@link resolveBundledGitDir} using `resourcesPath`. `null` → no-op.
   */
  gitDir?: string | null;
  /** Forwarded to resolveBundledGitDir when `gitDir` omitted. */
  resourcesPath?: string;
  candidates?: string[];
  /** Override `fs.existsSync` for tests. */
  exists?: (p: string) => boolean;
}

/**
 * Prepend bundled git/sh dirs to `env.PATH` and set git env vars when the
 * active source is "bundled" on Windows. Idempotent. No-op when:
 *   - platform is not win32,
 *   - `source` is provided and !== "bundled",
 *   - no bundled git tree is resolvable.
 *
 * Idempotence invariant:
 *   ensureBundledGitOnPath(ensureBundledGitOnPath(env)) deep-equals
 *   ensureBundledGitOnPath(env).
 */
export function ensureBundledGitOnPath(
  env: NodeJS.ProcessEnv,
  opts: EnsureBundledGitOpts = {},
): NodeJS.ProcessEnv {
  const platform = opts.platform ?? process.platform;
  if (platform !== "win32") return env;
  if (opts.source && opts.source !== "bundled") return env;

  const exists = opts.exists ?? existsSync;
  const gitDir =
    opts.gitDir !== undefined
      ? opts.gitDir
      : resolveBundledGitDir({
          platform,
          resourcesPath: opts.resourcesPath,
          candidates: opts.candidates,
          exists,
        });
  if (!gitDir) return env;

  const join = path.win32.join;
  const libDir = resolveLibDir(gitDir, exists);

  // PATH prepends, highest priority first. git launcher → shell+coreutils
  // → arch DLLs/libexec. libDir-dependent entry omitted when absent.
  const dirs = [join(gitDir, "cmd"), join(gitDir, "usr", "bin")];
  if (libDir) dirs.push(join(gitDir, libDir, "bin"));

  const currentPath = env.PATH ?? "";
  // Exact per-entry equality (case-insensitive), NOT substring containment:
  // substring matching would let `C:\x\usr\bin-old` block the required
  // `C:\x\usr\bin` prepend. Trailing separators trimmed.
  const present = new Set(
    currentPath
      .split(";")
      .map((e) => e.trim().replace(/[\\/]+$/, "").toLowerCase())
      .filter(Boolean),
  );
  const seen = new Set<string>();
  const toAdd: string[] = [];
  for (const dir of dirs) {
    if (!exists(dir)) continue;
    const lower = dir.replace(/[\\/]+$/, "").toLowerCase();
    if (present.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    toAdd.push(dir);
  }

  const DELIM = ";";
  let out = env;
  if (toAdd.length > 0) {
    const newPath = currentPath
      ? `${toAdd.join(DELIM)}${DELIM}${currentPath}`
      : toAdd.join(DELIM);
    out = { ...out, PATH: newPath };
  }

  // GIT_EXEC_PATH → <libdir>/libexec/git-core (idempotent: same value).
  if (libDir) {
    const execPath = join(gitDir, libDir, "libexec", "git-core");
    if (exists(execPath) && out.GIT_EXEC_PATH !== execPath) {
      out = { ...out, GIT_EXEC_PATH: execPath };
    }
  }

  // SSL_CERT_FILE → CA bundle, guarded by existence (path varies; only
  // set when actually present so a wrong guess is a no-op).
  if (libDir) {
    const caBundle = join(gitDir, libDir, "ssl", "certs", "ca-bundle.crt");
    if (exists(caBundle) && out.SSL_CERT_FILE !== caBundle) {
      out = { ...out, SSL_CERT_FILE: caBundle };
    }
  }

  return out;
}
