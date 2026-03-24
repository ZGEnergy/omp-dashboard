import { describe, it, expect } from "vitest";
import { detectOpenSpecActivity } from "../openspec-activity-detector.js";

describe("detectOpenSpecActivity", () => {
  describe("phase detection from skill file reads", () => {
    it("detects apply phase from SKILL.md read", () => {
      const result = detectOpenSpecActivity("Read", {
        path: ".pi/skills/openspec-apply-change/SKILL.md",
      });
      expect(result).toEqual({ phase: "apply" });
    });

    it("detects explore phase", () => {
      const result = detectOpenSpecActivity("Read", {
        path: ".pi/skills/openspec-explore/SKILL.md",
      });
      expect(result).toEqual({ phase: "explore" });
    });

    it("detects new phase", () => {
      const result = detectOpenSpecActivity("Read", {
        path: ".pi/skills/openspec-new-change/SKILL.md",
      });
      expect(result).toEqual({ phase: "new" });
    });

    it("detects continue phase", () => {
      const result = detectOpenSpecActivity("Read", {
        path: ".pi/skills/openspec-continue-change/SKILL.md",
      });
      expect(result).toEqual({ phase: "continue" });
    });

    it("detects ff phase", () => {
      const result = detectOpenSpecActivity("Read", {
        path: ".pi/skills/openspec-ff-change/SKILL.md",
      });
      expect(result).toEqual({ phase: "ff" });
    });

    it("detects verify phase", () => {
      const result = detectOpenSpecActivity("Read", {
        path: ".pi/skills/openspec-verify-change/SKILL.md",
      });
      expect(result).toEqual({ phase: "verify" });
    });

    it("detects archive phase", () => {
      const result = detectOpenSpecActivity("Read", {
        path: ".pi/skills/openspec-archive-change/SKILL.md",
      });
      expect(result).toEqual({ phase: "archive" });
    });

    it("detects sync-specs phase", () => {
      const result = detectOpenSpecActivity("Read", {
        path: ".pi/skills/openspec-sync-specs/SKILL.md",
      });
      expect(result).toEqual({ phase: "sync-specs" });
    });

    it("detects onboard phase", () => {
      const result = detectOpenSpecActivity("Read", {
        path: ".pi/skills/openspec-onboard/SKILL.md",
      });
      expect(result).toEqual({ phase: "onboard" });
    });

    it("handles absolute paths", () => {
      const result = detectOpenSpecActivity("Read", {
        path: "/Users/dev/project/.pi/skills/openspec-apply-change/SKILL.md",
      });
      expect(result).toEqual({ phase: "apply" });
    });

    it("returns null for non-openspec skill reads", () => {
      const result = detectOpenSpecActivity("Read", {
        path: ".pi/skills/some-other-skill/SKILL.md",
      });
      expect(result).toBeNull();
    });

    it("returns null for non-SKILL.md reads in openspec dirs", () => {
      const result = detectOpenSpecActivity("Read", {
        path: ".pi/skills/openspec-apply-change/README.md",
      });
      expect(result).toBeNull();
    });
  });

  describe("change name detection from CLI calls", () => {
    it("detects change name from openspec status command", () => {
      const result = detectOpenSpecActivity("Bash", {
        command: 'openspec status --change "session-sync" --json',
      });
      expect(result).toEqual({ changeName: "session-sync" });
    });

    it("detects change name from openspec instructions command", () => {
      const result = detectOpenSpecActivity("Bash", {
        command: 'openspec instructions apply --change "my-feature" --json',
      });
      expect(result).toEqual({ changeName: "my-feature" });
    });

    it("detects change name without quotes", () => {
      const result = detectOpenSpecActivity("Bash", {
        command: "openspec status --change session-sync --json",
      });
      expect(result).toEqual({ changeName: "session-sync" });
    });

    it("detects change name from openspec archive command", () => {
      const result = detectOpenSpecActivity("Bash", {
        command: "openspec archive session-sync",
      });
      expect(result).toEqual({ changeName: "session-sync" });
    });

    it("returns null for non-openspec bash commands", () => {
      const result = detectOpenSpecActivity("Bash", {
        command: "npm test",
      });
      expect(result).toBeNull();
    });

    it("returns null for openspec list (no change name)", () => {
      const result = detectOpenSpecActivity("Bash", {
        command: "openspec list --json",
      });
      expect(result).toBeNull();
    });
  });

  describe("change name detection from file reads", () => {
    it("detects change name from openspec change file read", () => {
      const result = detectOpenSpecActivity("Read", {
        path: "openspec/changes/session-sync/tasks.md",
      });
      expect(result).toEqual({ changeName: "session-sync" });
    });

    it("detects change name from absolute path", () => {
      const result = detectOpenSpecActivity("Read", {
        path: "/Users/dev/project/openspec/changes/my-feature/proposal.md",
      });
      expect(result).toEqual({ changeName: "my-feature" });
    });

    it("returns null for non-openspec file reads", () => {
      const result = detectOpenSpecActivity("Read", {
        path: "src/server/server.ts",
      });
      expect(result).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("returns null for unknown tool names", () => {
      const result = detectOpenSpecActivity("Write", { path: "foo.ts" });
      expect(result).toBeNull();
    });

    it("returns null when args are missing", () => {
      const result = detectOpenSpecActivity("Read", undefined);
      expect(result).toBeNull();
    });

    it("returns null when args are empty", () => {
      const result = detectOpenSpecActivity("Read", {});
      expect(result).toBeNull();
    });
  });
});
