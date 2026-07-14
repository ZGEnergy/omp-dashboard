# DOX — packages/authoring-toolkit

Files in this directory. One row per source file.

| File | Purpose |
|------|---------|
| `README.md` | Package overview. General-purpose authoring skills for pi sessions. Pure-skill package (`package.json` manifest only, no `extension.ts`). Skills load by NL trigger: `skill-creator` (author/update a skill) and `session-to-guideline` (turn session JSONL into reusable playbook). Scripts run via `npx tsx scripts/…`, no build step. |
