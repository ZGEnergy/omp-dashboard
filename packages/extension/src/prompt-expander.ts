/**
 * Expand prompt templates from disk for slash commands sent via the dashboard.
 *
 * pi.sendUserMessage() calls session.prompt() with expandPromptTemplates: false,
 * which skips prompt template and skill expansion. This module provides a workaround
 * by reading template/skill files directly and expanding them.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { readdirSync, statSync } from "node:fs";

/** Scan directories for .md prompt template files */
function findPromptTemplates(cwd: string): Map<string, string> {
  const templates = new Map<string, string>();
  const dirs = [
    join(cwd, ".pi", "prompts"),
    join(cwd, ".pi", "skills"),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      scanDir(dir, templates);
    } catch { /* ignore */ }
  }
  return templates;
}

function scanDir(dir: string, templates: Map<string, string>): void {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        // Check for SKILL.md inside directory
        const skillFile = join(fullPath, "SKILL.md");
        if (existsSync(skillFile)) {
          templates.set(`skill:${entry}`, skillFile);
        }
      } else if (entry.endsWith(".md")) {
        const name = entry.replace(/\.md$/, "");
        templates.set(name, fullPath);
      }
    } catch { /* ignore */ }
  }
}

/** Read template content, stripping YAML frontmatter */
function readTemplate(filePath: string): string {
  const content = readFileSync(filePath, "utf-8");
  // Strip YAML frontmatter (---\n...\n---)
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return match ? match[1].trim() : content.trim();
}

/**
 * Expand a slash command by finding and reading the prompt template from disk.
 * Returns the expanded text, or the original text if no template found.
 */
export function expandPromptTemplateFromDisk(text: string, cwd: string): string {
  if (!text.startsWith("/")) return text;

  const spaceIndex = text.indexOf(" ");
  const templateName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
  const argsString = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);

  const templates = findPromptTemplates(cwd);
  let filePath = templates.get(templateName);

  // Support colon as alias for hyphen (e.g. /opsx:continue → opsx-continue)
  if (!filePath && templateName.includes(":")) {
    filePath = templates.get(templateName.replace(/:/g, "-"));
  }

  if (!filePath) return text;

  try {
    const content = readTemplate(filePath);
    // Simple arg substitution: replace $1, $2, etc. or just append args
    if (argsString) {
      return `${content}\n\n${argsString}`;
    }
    return content;
  } catch {
    return text;
  }
}
