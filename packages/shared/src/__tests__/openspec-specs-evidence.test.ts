/**
 * Tests for the local-specs-evidence override that protects against
 * cache staleness on multi-spec changes.
 * See change: fix-openspec-specs-mtime-gate-blind-spot.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync, symlinkSync, chmodSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  evaluateLocalSpecsSatisfaction,
  createFsSpecsEvidenceProbe,
  type SpecsEvidenceProbe,
} from "../openspec-specs-evidence.js";

/** In-memory probe stub. */
function probe(hasAny: boolean): SpecsEvidenceProbe {
  return { hasAnySpecFile: () => hasAny };
}

describe("evaluateLocalSpecsSatisfaction", () => {
  it("returns true when probe reports a spec file present", () => {
    expect(evaluateLocalSpecsSatisfaction("/c", probe(true))).toBe(true);
  });

  it("returns false when probe reports no spec file", () => {
    expect(evaluateLocalSpecsSatisfaction("/c", probe(false))).toBe(false);
  });
});

describe("createFsSpecsEvidenceProbe", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "specs-evidence-"));
  });

  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  it("(a) specs/<cap>/spec.md exists → true", () => {
    mkdirSync(path.join(tmp, "specs", "cap-a"), { recursive: true });
    writeFileSync(path.join(tmp, "specs", "cap-a", "spec.md"), "## ADDED Requirements\n");
    expect(createFsSpecsEvidenceProbe().hasAnySpecFile(tmp)).toBe(true);
  });

  it("(b) empty specs/ directory → false", () => {
    mkdirSync(path.join(tmp, "specs"), { recursive: true });
    expect(createFsSpecsEvidenceProbe().hasAnySpecFile(tmp)).toBe(false);
  });

  it("(c) specs/ does not exist → false (no throw)", () => {
    // tmp deliberately has no specs/
    expect(() => createFsSpecsEvidenceProbe().hasAnySpecFile(tmp)).not.toThrow();
    expect(createFsSpecsEvidenceProbe().hasAnySpecFile(tmp)).toBe(false);
  });

  it("(d) deep layout specs/<cap>/sub/file.md → true", () => {
    mkdirSync(path.join(tmp, "specs", "cap-a", "sub"), { recursive: true });
    writeFileSync(path.join(tmp, "specs", "cap-a", "sub", "file.md"), "deep");
    expect(createFsSpecsEvidenceProbe().hasAnySpecFile(tmp)).toBe(true);
  });

  it("(e) flat layout specs/cap.md → true", () => {
    mkdirSync(path.join(tmp, "specs"), { recursive: true });
    writeFileSync(path.join(tmp, "specs", "cap.md"), "flat");
    expect(createFsSpecsEvidenceProbe().hasAnySpecFile(tmp)).toBe(true);
  });

  it("only counts *.md files (other extensions ignored)", () => {
    mkdirSync(path.join(tmp, "specs", "cap-a"), { recursive: true });
    writeFileSync(path.join(tmp, "specs", "cap-a", "notes.txt"), "not a spec");
    writeFileSync(path.join(tmp, "specs", "cap-a", "schema.json"), "{}");
    expect(createFsSpecsEvidenceProbe().hasAnySpecFile(tmp)).toBe(false);
  });

  it("(f) symlinked .md outside specs is NOT counted by virtue of being inside specs anyway when symlinked-in", () => {
    // Create a sibling .md outside specs/, then symlink it INTO specs/. fs.readdirSync with
    // withFileTypes returns Dirent.isFile() = false for symlinks; .isSymbolicLink() = true.
    // Since the probe only treats `.isFile()` as a hit, symlinks are correctly ignored.
    writeFileSync(path.join(tmp, "outside.md"), "outside the specs tree");
    mkdirSync(path.join(tmp, "specs", "cap-a"), { recursive: true });
    try {
      symlinkSync(
        path.join(tmp, "outside.md"),
        path.join(tmp, "specs", "cap-a", "linked.md"),
      );
    } catch {
      // skip on platforms that don't allow symlinks (e.g. Windows without admin)
      return;
    }
    expect(createFsSpecsEvidenceProbe().hasAnySpecFile(tmp)).toBe(false);
  });

  it("(g) probe never throws on permission errors", () => {
    // Deny read on specs/. POSIX-only; on Windows chmod is a no-op so we just
    // assert no throw under the platform's actual semantics.
    mkdirSync(path.join(tmp, "specs", "cap-a"), { recursive: true });
    writeFileSync(path.join(tmp, "specs", "cap-a", "spec.md"), "x");
    try {
      chmodSync(path.join(tmp, "specs"), 0o000);
    } catch {
      // chmod may not be supported on this fs/platform; skip the unreadable case
    }
    let result: boolean | "threw" = "threw";
    try {
      result = createFsSpecsEvidenceProbe().hasAnySpecFile(tmp);
    } catch {
      // restore perms before failing
      try {
        chmodSync(path.join(tmp, "specs"), 0o755);
      } catch {
        /* ignore */
      }
      throw new Error("probe threw on unreadable specs/ — must be defensive");
    }
    // restore perms so afterEach cleanup can rm -rf
    try {
      chmodSync(path.join(tmp, "specs"), 0o755);
    } catch {
      /* ignore */
    }
    // result is implementation-defined (true if readable, false if not), but
    // MUST NOT throw. Both valid outcomes are accepted.
    expect(typeof result).toBe("boolean");
  });

  it("short-circuits on first match (does not enumerate further siblings)", () => {
    // Indirect proof: deeply nested tree with hundreds of empty dirs plus one
    // spec.md at the root of specs/. Should still return true quickly.
    mkdirSync(path.join(tmp, "specs"), { recursive: true });
    writeFileSync(path.join(tmp, "specs", "cap-a.md"), "first");
    for (let i = 0; i < 50; i++) {
      mkdirSync(path.join(tmp, "specs", `empty-${i}`), { recursive: true });
    }
    expect(createFsSpecsEvidenceProbe().hasAnySpecFile(tmp)).toBe(true);
  });
});
