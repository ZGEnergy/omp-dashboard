/**
 * Blob path resolution + containment guard for the `GET /api/plugins/invoicebot/blob`
 * route. Given a request `cwd` and a `handle`, resolve the target file under
 * `<cwd>/.pi/flows/invoicebot-state/blobs/` and REFUSE anything that escapes it.
 *
 * Two-stage containment (design D2):
 *   1. lexical — `resolve(root, handle)` must stay under `root` (defeats `..`
 *      segments and absolute-path handles, which `resolve` would otherwise honor).
 *   2. real-path — `realpathSync(target)` must stay under `realpathSync(root)`
 *      (defeats symlink escape).
 *
 * The engine emits handles shaped `blobs/<hash>_<basename>`; a single leading
 * `blobs/` (or `blobs\`) segment is stripped before resolution so both the full
 * handle and a bare basename work. See change: serve-invoice-original-blob.
 */
import { realpathSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

/** Outcome of {@link resolveBlobPath}. `abs` is a real, contained, regular-file path. */
export type BlobResolution =
  | { ok: true; abs: string }
  | { ok: false; reason: "invalid-input" | "traversal" | "not-found" };

/** True when `p` is `root` itself is NOT allowed — only strict descendants count. */
function isInside(root: string, p: string): boolean {
  return p.startsWith(root + sep);
}

/**
 * Resolve `handle` to a contained absolute file path under the workspace blob store.
 * Never throws; every failure maps to a typed `reason` (route maps to 400/403/404).
 */
export function resolveBlobPath(cwd: unknown, handle: unknown): BlobResolution {
  if (typeof cwd !== "string" || cwd.trim() === "" || cwd.includes("\0")) {
    return { ok: false, reason: "invalid-input" };
  }
  if (typeof handle !== "string" || handle.trim() === "" || handle.includes("\0")) {
    return { ok: false, reason: "invalid-input" };
  }

  const root = resolve(cwd, ".pi/flows/invoicebot-state/blobs");
  const rel = handle.replace(/^blobs[/\\]+/, "");
  const target = resolve(root, rel);

  // Stage 1 — lexical containment (catches `..` and absolute-path handles).
  if (!isInside(root, target)) return { ok: false, reason: "traversal" };

  // Stage 2 — real-path containment (catches symlink escape) + existence.
  let real: string;
  try {
    real = realpathSync(target);
  } catch {
    return { ok: false, reason: "not-found" };
  }
  let realRoot: string;
  try {
    realRoot = realpathSync(root);
  } catch {
    return { ok: false, reason: "not-found" };
  }
  if (!isInside(realRoot, real)) return { ok: false, reason: "traversal" };

  try {
    if (!statSync(real).isFile()) return { ok: false, reason: "not-found" };
  } catch {
    return { ok: false, reason: "not-found" };
  }

  return { ok: true, abs: real };
}

/** Map a filename/extension to a Content-Type; unknown → octet-stream (design D3). */
export function contentTypeFor(pathOrExt: string): string {
  switch (extname(pathOrExt).toLowerCase()) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}
