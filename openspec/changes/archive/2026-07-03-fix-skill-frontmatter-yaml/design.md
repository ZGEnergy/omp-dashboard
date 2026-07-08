## Context

pi discovers skills by walking skill roots for `SKILL.md` files (`if (entry.name !== "SKILL.md") continue;`) and parsing YAML frontmatter. The loader lives in pi core: `node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js`. On startup it emitted:

```
ship-change/SKILL.md            Nested mappings are not allowed in compact mappings (line 2, col 14)
frontend-mockup-loop/SKILL.md   Nested mappings are not allowed in compact mappings
anti-slop-frontend/SKILL.md     Nested mappings are not allowed in compact mappings
.pi/skills/AGENTS.md            description is required
pi-dashboard / document-converter   collision (project copy wins, package copy skipped)
```

## Root cause (proven)

The three failing descriptions are **unquoted plain scalars** that contain `Triggers: "..."`. In YAML a plain scalar with an inner `colon-space` is ambiguous with a nested mapping, so the parser rejects it. Control case: `frontend-mockup-loop-dashboard` has the identical `Triggers:` pattern but its description is **quoted**, and it loads fine.

```
FAILS:  description: ... Triggers: "design a screen" ...
                         └─ unquoted scalar + inner ": " ⇒ parser sees nested map

WORKS:  description: "... Triggers: \"design a screen\" ..."
                     └─ quoted scalar ⇒ ": " is just a character
```

The error's "line 2" is off-by-one because the loader strips the `---` fence before parsing (fence-relative line 2 = file line 3 = the `description:` line).

## Decisions

### D1 — Fix the files, not the loader (location forces it)
The loader is in `node_modules` (pi core). We cannot patch it in-repo. Therefore the in-repo fix is to make the skill files' frontmatter unambiguous. This is not the "weaker" fix by choice — it is the only surface we own.

### D2 — Quote the whole description value (chosen) vs block scalar
Two valid YAML repairs:

| Option | Form | Verdict |
|---|---|---|
| **Double-quote** (chosen) | `description: "…Triggers: \"design a screen\"…"` | Minimal diff, one line, matches the working control (`frontend-mockup-loop-dashboard`). Inner `"` escaped as `\"`. |
| Block scalar | `description: >-`  then indented text | Avoids escaping inner quotes, but multi-line churn and re-indent risk. |

Choose double-quote for smallest, provably-correct diff. Preserve wording verbatim; only add the wrapping quotes and escape inner `"`.

### D3 — Prevent recurrence with a repo guard (the durable value)
The one-line quotes fix today's breakage; they do not stop the next author from writing an unquoted `Triggers:` description. Add a unit test that globs every `**/SKILL.md` (excluding `node_modules`), extracts the `---`-fenced frontmatter, parses it with a real YAML parser, and asserts `description` is a non-empty string. This fails CI the moment any skill manifest is unparseable — turning a silent-at-runtime warning into a loud-at-CI failure.

### D4 — AGENTS.md false-positive and collisions: out of scope
- `.pi/skills/AGENTS.md → description is required`: our `AGENTS.md` is a DOX tree file with no frontmatter; pi's scan flags it. The loader over-scan is upstream. In-repo we neither add fake frontmatter to a DOX file nor delete the DOX row. **Leave as known upstream noise.**
- `pi-dashboard` / `document-converter` collisions: by design — project `.pi/skills/` shadows the `packages/**` embedded copy. No action unless the copies have drifted (out of scope here).

## Upstream follow-ups (not this change)
- pi-core skill loader could tolerate unquoted descriptions (or emit a clearer, file+line-accurate diagnostic).
- pi-core could stop treating `AGENTS.md` as a skill-manifest candidate.

## Risks / trade-offs
- Escaping inner quotes by hand risks a typo; the D3 guard test doubles as the verification that the edited files now parse.
- Guard globs the whole repo — keep it fast by excluding `node_modules`, `dist`, worktrees.
