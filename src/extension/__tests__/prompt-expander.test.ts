import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expandPromptTemplateFromDisk } from "../prompt-expander.js";

const tmpDir = join(import.meta.dirname ?? __dirname, "__tmp_prompt_test__");
const promptsDir = join(tmpDir, ".pi", "prompts");

beforeEach(() => {
  mkdirSync(promptsDir, { recursive: true });
  writeFileSync(join(promptsDir, "opsx-continue.md"), "---\ndescription: continue\n---\nContinue the change");
  writeFileSync(join(promptsDir, "opsx-apply.md"), "Apply the change");
  writeFileSync(join(promptsDir, "hello.md"), "Hello world");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("expandPromptTemplateFromDisk", () => {
  it("expands hyphen form /opsx-continue", () => {
    const result = expandPromptTemplateFromDisk("/opsx-continue my-change", tmpDir);
    expect(result).toContain("Continue the change");
    expect(result).toContain("my-change");
  });

  it("expands colon form /opsx:continue as alias for /opsx-continue", () => {
    const result = expandPromptTemplateFromDisk("/opsx:continue my-change", tmpDir);
    expect(result).toContain("Continue the change");
    expect(result).toContain("my-change");
  });

  it("expands colon form /opsx:apply without args", () => {
    const result = expandPromptTemplateFromDisk("/opsx:apply", tmpDir);
    expect(result).toBe("Apply the change");
  });

  it("does not affect non-opsx colon commands", () => {
    // /hello has no colon, should work as before
    const result = expandPromptTemplateFromDisk("/hello", tmpDir);
    expect(result).toBe("Hello world");
  });

  it("returns original text when no template found", () => {
    const result = expandPromptTemplateFromDisk("/nonexistent", tmpDir);
    expect(result).toBe("/nonexistent");
  });

  it("strips YAML frontmatter from colon form too", () => {
    const result = expandPromptTemplateFromDisk("/opsx:continue", tmpDir);
    expect(result).toBe("Continue the change");
    expect(result).not.toContain("---");
  });
});
