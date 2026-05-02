## Why

The `.shadow/` directory holds jj workspace clones (per `.pi/skills/jj-workspace/SKILL.md`). These are local-only working trees that must never be committed to the main repo, but `.gitignore` does not currently exclude them, leaving footguns where an agent or human could accidentally `git add .shadow/...`.

## What Changes

- Add `.shadow/` entry to the repo-root `.gitignore` so jj workspace clones are excluded from git status, add, and commit operations.

## Capabilities

### New Capabilities
- `repo-hygiene`: Repo-level ignore rules that keep local-only working directories (jj workspaces, build outputs, caches) out of git.

### Modified Capabilities
*(none — no spec-level requirements changing)*

## Impact

- `/.gitignore` — one-line addition.
- No code changes, no API changes, no runtime behavior changes.
- Eliminates a footgun for agents working in `.shadow/<name>/` jj workspaces.
