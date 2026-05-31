/**
 * pi-image-fit extension entry point.
 *
 * Registers a single `tool_call` hook that, when the agent reads an
 * image whose byte size or long edge exceeds the configured limits,
 * re-encodes the image to a smaller temp file and rewrites
 * `event.input.path` so the built-in Read attaches the resized bytes.
 *
 * All work is wrapped in try/catch with fall-through: any failure
 * leaves `event.input.path` unmodified and logs a single warning.
 *
 * Spec: pi-image-fit/spec.md (all requirements).
 * Design: design.md.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readConfigFromEnv, type ImageFitConfig } from "./policy.js";
import {
  scopeFor,
  cacheKey,
  ensureDir,
  hasCached,
  cleanupSession,
  cleanupOrphans,
  type CacheScope,
} from "./cache.js";
import {
  isImagePath,
  needsResize,
  outputFormatFor,
  probeDims,
  resizeToFile,
} from "./resize.js";

export default function imageFitExtension(pi: ExtensionAPI): void {
  const config: ImageFitConfig = readConfigFromEnv();

  if (config.disabled) {
    console.log("[pi-image-fit] disabled via PI_IMAGE_FIT_DISABLE");
    return;
  }

  // Best-effort orphan sweep on load. Errors swallowed-and-logged
  // internally. Fire-and-forget — we do not block extension load on it.
  cleanupOrphans().catch(() => {
    /* already logged by cleanupOrphans */
  });

  // Session scope is established lazily: the first tool_call we see
  // pulls sessionId from ctx.sessionManager (if available) or falls
  // back to `pid-<process.pid>`. We cache the scope per session id so
  // that mid-session changes (resume into a different session) get a
  // fresh dir.
  let cachedScope: { sessionId: string; scope: CacheScope } | null = null;

  function getScopeFor(ctx: unknown): CacheScope {
    const sessionId = readSessionIdFromCtx(ctx);
    if (!cachedScope || cachedScope.sessionId !== sessionId) {
      cachedScope = { sessionId, scope: scopeFor(sessionId) };
    }
    return cachedScope.scope;
  }

  pi.on("tool_call", async (event, ctx) => {
    // Fast-path gates. None of these touch the filesystem.
    if (event.toolName !== "read") return;
    const srcPath = event.input?.path;
    if (typeof srcPath !== "string" || srcPath.length === 0) return;
    if (!isImagePath(srcPath)) return;

    try {
      await maybeResize(srcPath, event, ctx, config, getScopeFor);
    } catch (err) {
      // Last-resort catch — every internal step already logs its own
      // warning, but a thrown error here means we missed one. Log and
      // fall through; event.input.path is whatever the deepest mutation
      // left it (callee responsibility to restore on partial failure).
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[pi-image-fit] WARN unexpected error for ${srcPath}: ${msg}`);
    }
  });

  pi.on("session_shutdown", async () => {
    if (cachedScope) {
      await cleanupSession(cachedScope.scope);
      cachedScope = null;
    }
  });
}

/**
 * Core resize pipeline. Mutates `event.input.path` on success;
 * leaves it untouched on any failure (logs once and returns).
 */
async function maybeResize(
  srcPath: string,
  event: { input: { path: string } },
  ctx: unknown,
  config: ImageFitConfig,
  getScopeFor: (ctx: unknown) => CacheScope,
): Promise<void> {
  // Stat: get bytes + mtime. ENOENT and friends → fall through to
  // built-in Read which produces the appropriate user-facing error.
  let bytes: number;
  let mtimeMs: number;
  try {
    const st = await fs.stat(srcPath);
    if (!st.isFile()) return;
    bytes = st.size;
    mtimeMs = st.mtimeMs;
  } catch (err) {
    // Source file missing or unreadable — let built-in Read handle the error.
    // No warning: this is pi's normal Read-error path, not an extension fault.
    void err;
    return;
  }

  // Byte-size short-circuit: if the source is already under the byte
  // ceiling AND the (presumed) long edge cannot exceed maxEdge without
  // a dimension probe, we'd still need to probe. Probe once and decide.
  const dims = await probeDims(srcPath);
  if (!dims) {
    // Jimp couldn't decode — likely corrupted or unsupported variant.
    // Fall through to built-in Read which will surface the file as-is.
    console.warn(`[pi-image-fit] WARN could not decode ${srcPath}; passing through original`);
    return;
  }

  if (!needsResize({ bytes, maxBytes: config.maxBytes, dims, maxEdge: config.maxEdge })) {
    // Already-small image — pass through untouched. No log line.
    return;
  }

  // Resize is needed. Compute cache key + output path.
  const { ext: outExt } = outputFormatFor(srcPath);
  const absPath = path.resolve(srcPath);
  const key = cacheKey({
    absPath,
    mtimeMs,
    maxEdge: config.maxEdge,
    maxBytes: config.maxBytes,
    quality: config.quality,
  });
  const scope = getScopeFor(ctx);
  const dstPath = scope.filePath(key, outExt);

  // Cache hit: rewrite path, no work.
  if (await hasCached(scope, key, outExt)) {
    event.input.path = dstPath;
    return;
  }

  // Cache miss: ensure dir, resize, rewrite path, log once.
  try {
    await ensureDir(scope.dir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[pi-image-fit] WARN could not create cache dir ${scope.dir}: ${msg}; passing through original`);
    return;
  }

  try {
    const result = await resizeToFile(srcPath, dstPath, {
      maxEdge: config.maxEdge,
      quality: config.quality,
    });
    event.input.path = dstPath;
    console.log(
      `[pi-image-fit] ${srcPath} ${result.srcDims.width}\u00d7${result.srcDims.height} ${formatBytes(bytes)} \u2192 ${result.dstDims.width}\u00d7${result.dstDims.height} ${formatBytes(result.dstBytes)}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Defensive cleanup: a partial write would leave a corrupt file
    // matching the cache key, poisoning later reads. Best-effort unlink.
    try {
      await fs.unlink(dstPath);
    } catch {
      /* ignore */
    }
    console.warn(`[pi-image-fit] WARN resize failed for ${srcPath}: ${msg}; passing through original`);
    // event.input.path was not mutated yet — original path stands.
  }
}

function readSessionIdFromCtx(ctx: unknown): string {
  try {
    const sm = (ctx as { sessionManager?: { getSessionId?: () => string } } | undefined)?.sessionManager;
    if (sm && typeof sm.getSessionId === "function") {
      const id = sm.getSessionId();
      if (typeof id === "string" && id.length > 0) return id;
    }
  } catch {
    /* ignore */
  }
  return `pid-${process.pid}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}
