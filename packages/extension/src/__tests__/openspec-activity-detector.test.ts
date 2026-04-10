import { describe, it, expect } from "vitest";
import { detectOpenSpecActivity } from "@blackbelt-technology/pi-dashboard-shared/openspec-activity-detector.js";

describe("detectOpenSpecActivity", () => {
  describe("phase detection from skill file reads", () => {
    it("detects apply phase from SKILL.md read", () => {
      const result = detectOpenSpecActivity("read", {
        path: ".pi/skills/openspec-apply-change/SKILL.md",
      });
      expect(result).toEqual({ phase: "apply" });
    });

    it("detects explore phase", () => {
      const result = detectOpenSpecActivity("read", {
        path: ".pi/skills/openspec-explore/SKILL.md",
      });
      expect(result).toEqual({ phase: "explore" });
    });

    it("detects new phase", () => {
      const result = detectOpenSpecActivity("read", {
        path: ".pi/skills/openspec-new-change/SKILL.md",
      });
      expect(result).toEqual({ phase: "new" });
    });

    it("detects continue phase", () => {
      const result = detectOpenSpecActivity("read", {
        path: ".pi/skills/openspec-continue-change/SKILL.md",
      });
      expect(result).toEqual({ phase: "continue" });
    });

    it("detects ff phase", () => {
      const result = detectOpenSpecActivity("read", {
        path: ".pi/skills/openspec-ff-change/SKILL.md",
      });
      expect(result).toEqual({ phase: "ff" });
    });

    it("detects verify phase", () => {
      const result = detectOpenSpecActivity("read", {
        path: ".pi/skills/openspec-verify-change/SKILL.md",
      });
      expect(result).toEqual({ phase: "verify" });
    });

    it("detects archive phase", () => {
      const result = detectOpenSpecActivity("read", {
        path: ".pi/skills/openspec-archive-change/SKILL.md",
      });
      expect(result).toEqual({ phase: "archive" });
    });

    it("detects sync-specs phase", () => {
      const result = detectOpenSpecActivity("read", {
        path: ".pi/skills/openspec-sync-specs/SKILL.md",
      });
      expect(result).toEqual({ phase: "sync-specs" });
    });

    it("detects onboard phase", () => {
      const result = detectOpenSpecActivity("read", {
        path: ".pi/skills/openspec-onboard/SKILL.md",
      });
      expect(result).toEqual({ phase: "onboard" });
    });

    it("handles absolute paths", () => {
      const result = detectOpenSpecActivity("read", {
        path: "/Users/dev/project/.pi/skills/openspec-apply-change/SKILL.md",
      });
      expect(result).toEqual({ phase: "apply" });
    });

    it("returns null for non-openspec skill reads", () => {
      const result = detectOpenSpecActivity("read", {
        path: ".pi/skills/some-other-skill/SKILL.md",
      });
      expect(result).toBeNull();
    });

    it("returns null for non-SKILL.md reads in openspec dirs", () => {
      const result = detectOpenSpecActivity("read", {
        path: ".pi/skills/openspec-apply-change/README.md",
      });
      expect(result).toBeNull();
    });
  });

  describe("change name detection from CLI calls", () => {
    it("detects change name from openspec status command", () => {
      const result = detectOpenSpecActivity("bash", {
        command: 'openspec status --change "session-sync" --json',
      });
      expect(result).toEqual({ changeName: "session-sync" });
    });

    it("detects change name from openspec instructions command", () => {
      const result = detectOpenSpecActivity("bash", {
        command: 'openspec instructions apply --change "my-feature" --json',
      });
      expect(result).toEqual({ changeName: "my-feature" });
    });

    it("detects change name without quotes", () => {
      const result = detectOpenSpecActivity("bash", {
        command: "openspec status --change session-sync --json",
      });
      expect(result).toEqual({ changeName: "session-sync" });
    });

    it("detects change name from openspec archive command", () => {
      const result = detectOpenSpecActivity("bash", {
        command: "openspec archive session-sync",
      });
      expect(result).toEqual({ changeName: "session-sync" });
    });

    it("returns null for non-openspec bash commands", () => {
      const result = detectOpenSpecActivity("bash", {
        command: "npm test",
      });
      expect(result).toBeNull();
    });

    it("detects change name from openspec new change with quoted name", () => {
      const result = detectOpenSpecActivity("bash", {
        command: 'openspec new change "add-auth"',
      });
      expect(result).toEqual({ changeName: "add-auth" });
    });

    it("detects change name from openspec new change with unquoted name", () => {
      const result = detectOpenSpecActivity("bash", {
        command: "openspec new change add-auth",
      });
      expect(result).toEqual({ changeName: "add-auth" });
    });

    it("detects change name from openspec new change with cd prefix", () => {
      const result = detectOpenSpecActivity("bash", {
        command: 'cd /Users/dev/project && openspec new change "my-feature"',
      });
      expect(result).toEqual({ changeName: "my-feature" });
    });

    it("returns null for openspec list (no change name)", () => {
      const result = detectOpenSpecActivity("bash", {
        command: "openspec list --json",
      });
      expect(result).toBeNull();
    });
  });

  describe("change name detection from file reads", () => {
    it("detects change name from openspec change file read", () => {
      const result = detectOpenSpecActivity("read", {
        path: "openspec/changes/session-sync/tasks.md",
      });
      expect(result).toEqual({ changeName: "session-sync" });
    });

    it("detects change name from absolute path", () => {
      const result = detectOpenSpecActivity("read", {
        path: "/Users/dev/project/openspec/changes/my-feature/proposal.md",
      });
      expect(result).toEqual({ changeName: "my-feature" });
    });

    it("returns null for non-openspec file reads", () => {
      const result = detectOpenSpecActivity("read", {
        path: "src/server/server.ts",
      });
      expect(result).toBeNull();
    });
  });

  describe("change name detection from file writes", () => {
    it("detects change name from openspec change file write", () => {
      const result = detectOpenSpecActivity("write", {
        path: "openspec/changes/session-sync/proposal.md",
      });
      expect(result).toEqual({ changeName: "session-sync" });
    });

    it("detects change name from absolute path write", () => {
      const result = detectOpenSpecActivity("write", {
        path: "/Users/dev/project/openspec/changes/my-feature/spec.md",
      });
      expect(result).toEqual({ changeName: "my-feature" });
    });

    it("returns null for non-openspec file writes", () => {
      const result = detectOpenSpecActivity("write", {
        path: "src/server/server.ts",
      });
      expect(result).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("handles capitalized tool names (backward compatibility)", () => {
      expect(detectOpenSpecActivity("Read", {
        path: "openspec/changes/my-feature/proposal.md",
      })).toEqual({ changeName: "my-feature" });

      expect(detectOpenSpecActivity("Bash", {
        command: 'openspec status --change "add-auth" --json',
      })).toEqual({ changeName: "add-auth" });

      expect(detectOpenSpecActivity("Write", {
        path: "openspec/changes/my-feature/design.md",
      })).toEqual({ changeName: "my-feature" });
    });

    it("returns null for unknown tool names", () => {
      const result = detectOpenSpecActivity("unknown", { path: "foo.ts" });
      expect(result).toBeNull();
    });

    it("returns null when args are missing", () => {
      const result = detectOpenSpecActivity("read", undefined);
      expect(result).toBeNull();
    });

    it("returns null when args are empty", () => {
      const result = detectOpenSpecActivity("read", {});
      expect(result).toBeNull();
    });
  });
});
