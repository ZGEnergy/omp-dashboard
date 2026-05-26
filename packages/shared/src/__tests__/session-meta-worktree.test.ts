/**
 * Tests that `SessionMeta.gitWorktreeBase` round-trips through the
 * sidecar `.meta.json` writer/reader. Verifies the field is preserved
 * by `mergeSessionMeta` (i.e. doesn't get wiped by a partial update of
 * other fields).
 *
 * See change: add-worktree-spawn-dialog.
 */
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type SessionMeta,
  mergeSessionMeta,
  metaPath,
  readSessionMeta,
  writeSessionMeta,
} from "../session-meta.js";

let tmpdir: string;
let sessionFile: string;

beforeEach(() => {
  tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "session-meta-wt-"));
  sessionFile = path.join(tmpdir, "session.jsonl");
});

describe("SessionMeta.gitWorktreeBase round-trip", () => {
  it("writes and reads gitWorktreeBase verbatim", () => {
    const meta: SessionMeta = {
      source: "dashboard",
      gitWorktreeBase: "develop",
    };
    writeSessionMeta(sessionFile, meta);
    expect(readSessionMeta(sessionFile)).toEqual(meta);
  });

  it("mergeSessionMeta preserves an existing gitWorktreeBase when other fields are updated", () => {
    writeSessionMeta(sessionFile, { source: "dashboard", gitWorktreeBase: "develop" });
    mergeSessionMeta(sessionFile, { name: "renamed", tokensIn: 42 });
    const merged = readSessionMeta(sessionFile);
    expect(merged?.gitWorktreeBase).toBe("develop");
    expect(merged?.name).toBe("renamed");
    expect(merged?.tokensIn).toBe(42);
  });

  it("mergeSessionMeta replaces gitWorktreeBase when explicitly provided", () => {
    writeSessionMeta(sessionFile, { source: "dashboard", gitWorktreeBase: "develop" });
    mergeSessionMeta(sessionFile, { gitWorktreeBase: "main" });
    expect(readSessionMeta(sessionFile)?.gitWorktreeBase).toBe("main");
  });

  it("absent gitWorktreeBase is undefined on read (backward-compat with older meta files)", () => {
    fs.writeFileSync(
      metaPath(sessionFile),
      JSON.stringify({ source: "dashboard", name: "legacy" }),
    );
    expect(readSessionMeta(sessionFile)?.gitWorktreeBase).toBeUndefined();
  });
});
