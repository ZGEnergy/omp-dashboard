import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

/**
 * Guard: every SKILL.md in the repo MUST have YAML-parseable frontmatter
 * with a non-empty `description`. Skills whose frontmatter fails to parse are
 * silently dropped by pi's loader at startup (e.g. an unquoted description
 * containing `Triggers: "..."` triggers "Nested mappings are not allowed in
 * compact mappings"). This turns that silent runtime warning into a CI failure.
 *
 * See change: fix-skill-frontmatter-yaml.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'worktrees',
  '.worktrees',
]);

/** Recursively collect every SKILL.md path under `root`, skipping heavy dirs. */
function collectSkillManifests(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
      } else if (entry.name === 'SKILL.md') {
        found.push(join(dir, entry.name));
      }
    }
  };
  walk(root);
  return found;
}

/** Extract the leading `---`-fenced frontmatter block. Returns null if absent. */
function extractFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

const manifests = collectSkillManifests(REPO_ROOT);

describe('SKILL.md frontmatter validity', () => {
  it('discovers skill manifests to check', () => {
    expect(manifests.length).toBeGreaterThan(0);
  });

  it.each(manifests.map((p) => [relative(REPO_ROOT, p), p]))(
    '%s has YAML-parseable frontmatter with a non-empty description',
    (_rel, absPath) => {
      const text = readFileSync(absPath, 'utf8');
      const fm = extractFrontmatter(text);
      expect(fm, 'missing `---`-fenced frontmatter block').not.toBeNull();

      let parsed;
      expect(() => {
        parsed = parseYaml(fm);
      }, 'frontmatter must parse as valid YAML').not.toThrow();

      const description = parsed?.description;
      expect(
        typeof description === 'string' && description.trim().length > 0,
        '`description` must be a non-empty string',
      ).toBe(true);
    },
  );
});
