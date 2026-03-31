import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { scanLocalResources, scanGlobalResources, parseFrontmatter, resolvePackages, scanPiResources } from "../pi-resource-scanner.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-res-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relPath: string, content: string) {
  const full = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

describe("parseFrontmatter", () => {
  it("parses name and description from YAML frontmatter", () => {
    const content = `---
name: code-review
description: Comprehensive code review guidance.
license: MIT
---

# Code Review

Instructions here.`;
    const result = parseFrontmatter(content);
    expect(result.name).toBe("code-review");
    expect(result.description).toBe("Comprehensive code review guidance.");
  });

  it("handles multi-line description with >", () => {
    const content = `---
name: my-skill
description: >
  Line one
  line two.
---

Body`;
    const result = parseFrontmatter(content);
    expect(result.name).toBe("my-skill");
    expect(result.description).toContain("Line one");
  });

  it("returns empty object for no frontmatter", () => {
    const result = parseFrontmatter("# Just a heading\n\nSome content.");
    expect(result.name).toBeUndefined();
    expect(result.description).toBeUndefined();
  });

  it("extracts first non-empty line as description fallback", () => {
    const result = parseFrontmatter("# My Prompt\n\nDo something useful.", true);
    expect(result.description).toBe("# My Prompt");
  });
});

describe("scanLocalResources", () => {
  it("discovers skills from SKILL.md directories", () => {
    writeFile(".pi/skills/code-review/SKILL.md", `---
name: code-review
description: Review code.
---
Instructions`);
    const result = scanLocalResources(tmpDir);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].name).toBe("code-review");
    expect(result.skills[0].description).toBe("Review code.");
    expect(result.skills[0].type).toBe("skill");
  });

  it("discovers skills from root .md files", () => {
    writeFile(".pi/skills/quick-review.md", `---
name: quick-review
description: Quick review.
---
Body`);
    const result = scanLocalResources(tmpDir);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].name).toBe("quick-review");
  });

  it("discovers extensions from .ts files", () => {
    writeFile(".pi/extensions/my-ext.ts", "export default function() {}");
    const result = scanLocalResources(tmpDir);
    expect(result.extensions).toHaveLength(1);
    expect(result.extensions[0].name).toBe("my-ext");
    expect(result.extensions[0].type).toBe("extension");
  });

  it("discovers extensions from subdirectory index.ts", () => {
    writeFile(".pi/extensions/my-ext/index.ts", "export default function() {}");
    const result = scanLocalResources(tmpDir);
    expect(result.extensions).toHaveLength(1);
    expect(result.extensions[0].name).toBe("my-ext");
  });

  it("discovers prompts from .md files", () => {
    writeFile(".pi/prompts/review.md", `---
description: Review staged changes
---
Review the staged changes.`);
    const result = scanLocalResources(tmpDir);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0].name).toBe("review");
    expect(result.prompts[0].description).toBe("Review staged changes");
    expect(result.prompts[0].type).toBe("prompt");
  });

  it("returns empty arrays when .pi/ does not exist", () => {
    const result = scanLocalResources(path.join(tmpDir, "nonexistent"));
    expect(result.extensions).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.prompts).toEqual([]);
  });
});

describe("scanGlobalResources", () => {
  it("discovers resources from a global-like directory", () => {
    const globalDir = path.join(tmpDir, "global-pi");
    fs.mkdirSync(path.join(globalDir, "skills", "my-skill"), { recursive: true });
    fs.writeFileSync(path.join(globalDir, "skills", "my-skill", "SKILL.md"), `---
name: my-skill
description: A global skill.
---
Body`);
    fs.mkdirSync(path.join(globalDir, "extensions"), { recursive: true });
    fs.writeFileSync(path.join(globalDir, "extensions", "g-ext.ts"), "export default function() {}");
    fs.mkdirSync(path.join(globalDir, "prompts"), { recursive: true });
    fs.writeFileSync(path.join(globalDir, "prompts", "g-prompt.md"), "Do things.");

    const result = scanGlobalResources(globalDir);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].name).toBe("my-skill");
    expect(result.extensions).toHaveLength(1);
    expect(result.extensions[0].name).toBe("g-ext");
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0].name).toBe("g-prompt");
  });

  it("returns empty when directory does not exist", () => {
    const result = scanGlobalResources("/nonexistent/path");
    expect(result.extensions).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.prompts).toEqual([]);
  });
});

describe("resolvePackages", () => {
  it("resolves a local path package with pi manifest", () => {
    const pkgDir = path.join(tmpDir, "my-pkg");
    fs.mkdirSync(path.join(pkgDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, "src", "bridge.ts"), "export default function() {}");
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({
        name: "my-pkg",
        description: "A test package",
        pi: { extensions: ["./src/bridge.ts"] },
      }),
    );

    const result = resolvePackages([pkgDir], path.join(tmpDir, "settings-dir"));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("my-pkg");
    expect(result[0].description).toBe("A test package");
    expect(result[0].resources.extensions).toHaveLength(1);
    expect(result[0].resources.extensions[0].name).toBe("bridge");
  });

  it("resolves package with conventional directories (no pi manifest)", () => {
    const pkgDir = path.join(tmpDir, "conv-pkg");
    fs.mkdirSync(path.join(pkgDir, "extensions"), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, "extensions", "ext.ts"), "export default function() {}");
    fs.mkdirSync(path.join(pkgDir, "skills", "my-skill"), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, "skills", "my-skill", "SKILL.md"), `---
name: my-skill
description: Skill from package.
---
Body`);
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "conv-pkg", description: "Conventional" }),
    );

    const result = resolvePackages([pkgDir], path.join(tmpDir, "settings-dir"));
    expect(result).toHaveLength(1);
    expect(result[0].resources.extensions).toHaveLength(1);
    expect(result[0].resources.skills).toHaveLength(1);
  });

  it("skips missing packages silently", () => {
    const result = resolvePackages(["/nonexistent/package"], tmpDir);
    expect(result).toEqual([]);
  });

  it("resolves relative path packages from settings dir", () => {
    const settingsDir = path.join(tmpDir, "project", ".pi");
    const pkgDir = path.join(tmpDir, "sibling-pkg");
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "sibling", description: "Sibling package" }),
    );

    const result = resolvePackages(["../../sibling-pkg"], settingsDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("sibling");
  });
});

describe("scanPiResources (integration)", () => {
  it("combines local, global, and returns a full result", async () => {
    writeFile(".pi/skills/local-skill/SKILL.md", `---
name: local-skill
description: A local skill.
---
Body`);
    writeFile(".pi/prompts/my-prompt.md", "Do something.");

    // We pass a custom globalDir to avoid depending on ~/.pi/agent
    const result = await scanPiResources(tmpDir, { globalDir: path.join(tmpDir, "nonexistent-global") });
    expect(result.local.skills).toHaveLength(1);
    expect(result.local.prompts).toHaveLength(1);
    expect(result.global.skills).toEqual([]);
    expect(result.packages).toEqual([]);
  });
});
