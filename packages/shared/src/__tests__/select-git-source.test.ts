/**
 * Truth-table tests for selectGitSource (proposal §3).
 * See change: embed-git-bash-on-windows.
 */
import { describe, it, expect } from "vitest";
import { selectGitSource } from "../platform/select-git-source.js";

/** which-stub factory: resolvable command names → a fake path. */
function whichFor(present: string[]): (cmd: string) => string | null {
  const set = new Set(present);
  return (cmd) => (set.has(cmd) ? `C:\\fake\\${cmd}.exe` : null);
}

const both = whichFor(["git", "bash"]);
const gitOnly = whichFor(["git"]);
const bashOnly = whichFor(["bash"]);
const neither = whichFor([]);

describe("selectGitSource", () => {
  describe("non-Windows hosts → always host", () => {
    for (const platform of ["darwin", "linux"] as const) {
      for (const setting of ["auto", "host", "bundled"] as const) {
        it(`${platform} + ${setting} → host`, () => {
          expect(selectGitSource({ platform, setting, which: neither })).toBe("host");
        });
      }
    }
  });

  describe("win32 + auto (default)", () => {
    it("both host tools present → host", () => {
      expect(selectGitSource({ platform: "win32", setting: "auto", which: both })).toBe("host");
    });
    it("git only → bundled (atomic)", () => {
      expect(selectGitSource({ platform: "win32", setting: "auto", which: gitOnly })).toBe("bundled");
    });
    it("bash only → bundled (atomic)", () => {
      expect(selectGitSource({ platform: "win32", setting: "auto", which: bashOnly })).toBe("bundled");
    });
    it("neither → bundled", () => {
      expect(selectGitSource({ platform: "win32", setting: "auto", which: neither })).toBe("bundled");
    });
    it("setting omitted defaults to auto", () => {
      expect(selectGitSource({ platform: "win32", which: both })).toBe("host");
      expect(selectGitSource({ platform: "win32", which: neither })).toBe("bundled");
    });
  });

  describe("win32 + host", () => {
    it("both present → host", () => {
      expect(selectGitSource({ platform: "win32", setting: "host", which: both })).toBe("host");
    });
    it("missing → bundled fallback (Doctor flags the mismatch)", () => {
      expect(selectGitSource({ platform: "win32", setting: "host", which: neither })).toBe("bundled");
      expect(selectGitSource({ platform: "win32", setting: "host", which: gitOnly })).toBe("bundled");
    });
  });

  describe("win32 + bundled", () => {
    it("always bundled regardless of host", () => {
      expect(selectGitSource({ platform: "win32", setting: "bundled", which: both })).toBe("bundled");
      expect(selectGitSource({ platform: "win32", setting: "bundled", which: neither })).toBe("bundled");
    });
  });
});
