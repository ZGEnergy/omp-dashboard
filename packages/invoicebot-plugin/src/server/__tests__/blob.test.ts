/**
 * Unit tests for blob.ts path resolution + containment guard.
 * Covers happy path, `..` traversal, absolute handle, symlink escape, missing
 * file, and missing/blank cwd/handle (task 1.3). See change: serve-invoice-original-blob.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contentTypeFor, resolveBlobPath } from "../blob.js";

let cwd: string;
let outside: string;
let blobsDir: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "ib-blob-"));
  outside = mkdtempSync(join(tmpdir(), "ib-out-"));
  blobsDir = resolve(cwd, ".pi/flows/invoicebot-state/blobs");
  mkdirSync(blobsDir, { recursive: true });
  writeFileSync(join(blobsDir, "abc123_invoice.pdf"), "%PDF-1.4 fake");
  writeFileSync(join(outside, "secret.txt"), "top secret");
});
afterEach(() => {
  for (const d of [cwd, outside]) rmSync(d, { recursive: true, force: true });
});

describe("resolveBlobPath", () => {
  it("resolves a bare basename to the contained file", () => {
    const r = resolveBlobPath(cwd, "abc123_invoice.pdf");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.abs).toBe(resolve(blobsDir, "abc123_invoice.pdf"));
  });

  it("resolves a full `blobs/<name>` handle", () => {
    const r = resolveBlobPath(cwd, "blobs/abc123_invoice.pdf");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.abs).toBe(resolve(blobsDir, "abc123_invoice.pdf"));
  });

  it("rejects `..` traversal", () => {
    const r = resolveBlobPath(cwd, "../../../../../../etc/passwd");
    expect(r).toEqual({ ok: false, reason: "traversal" });
  });

  it("rejects an absolute-path handle", () => {
    const r = resolveBlobPath(cwd, join(outside, "secret.txt"));
    expect(r).toEqual({ ok: false, reason: "traversal" });
  });

  it("rejects a symlink escaping the blobs root", () => {
    symlinkSync(join(outside, "secret.txt"), join(blobsDir, "escape.pdf"));
    const r = resolveBlobPath(cwd, "escape.pdf");
    expect(r).toEqual({ ok: false, reason: "traversal" });
  });

  it("reports not-found for an absent file", () => {
    const r = resolveBlobPath(cwd, "does-not-exist.pdf");
    expect(r).toEqual({ ok: false, reason: "not-found" });
  });

  it("refuses a handle resolving to the blobs root itself", () => {
    const r = resolveBlobPath(cwd, "blobs/");
    expect(r).toEqual({ ok: false, reason: "traversal" });
  });

  it.each([
    ["missing cwd", undefined, "abc123_invoice.pdf"],
    ["blank cwd", "   ", "abc123_invoice.pdf"],
    ["missing handle", "/tmp", undefined],
    ["blank handle", "/tmp", "   "],
    ["NUL in handle", "/tmp", "a\0b.pdf"],
  ])("rejects %s as invalid-input", (_label, c, h) => {
    expect(resolveBlobPath(c, h)).toEqual({ ok: false, reason: "invalid-input" });
  });
});

describe("contentTypeFor", () => {
  it.each([
    ["x.pdf", "application/pdf"],
    ["x.PDF", "application/pdf"],
    ["x.png", "image/png"],
    ["x.jpg", "image/jpeg"],
    ["x.jpeg", "image/jpeg"],
    ["x.bin", "application/octet-stream"],
    ["noext", "application/octet-stream"],
  ])("maps %s → %s", (name, expected) => {
    expect(contentTypeFor(name)).toBe(expected);
  });
});
