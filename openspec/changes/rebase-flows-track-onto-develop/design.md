# Design — Rebase 18 commits onto origin/develop

## Pre-rebase state

```
                merge-base 61fe3516
                       │
                       ▼
                ┌──────────────┐
                │              │
              60 origin       18 local
              commits         commits
                │              │
                ▼              ▼
       origin/develop      HEAD (b0566863)
       (unchanged              (local-only)
        since fetch)
```

## Post-rebase target

```
       merge-base 61fe3516
              │
              ▼
       60 origin commits
              │
              ▼
     origin/develop tip
              │
              ▼
       18 rewritten local commits
       (new SHAs, same content,
        possibly resolved conflicts)
              │
              ▼
       new HEAD (replayed)
```

After rebase, `git log origin/develop..HEAD` will show the 18 (or fewer) commits. Local `develop` becomes a fast-forward of `origin/develop`. `git push origin develop` is a plain fast-forward — no `--force` required because the 18 commits were never published to origin.

## File-overlap matrix

Computed from `git log 61fe3516..origin/develop -- <file>` vs `git show <our-commit>:<file>`:

| File | Our commit(s) | Origin commits | Risk |
|------|---------------|----------------|------|
| `packages/client/src/components/SessionCard.tsx` | f75b3ea9 | 5 | **HIGH** |
| `packages/client/src/components/AgentCardShell.tsx` | 8a271b60 | 1 | **HIGH** |
| `AGENTS.md` | 1d02fbf4 | 4 | MED |
| `packages/dashboard-plugin-runtime/src/slot-consumers.tsx` | f706218f + 2d248280 | 1 | MED |
| `CHANGELOG.md` | 1d02fbf4 | 4 | LOW |
| `packages/client/src/App.tsx` | f75b3ea9 + 2d248280 | 2 | LOW |
| `packages/extension/src/bridge.ts` | 1f6a78e2 | 2 | NONE (different fns) |
| `packages/client/src/components/SessionList.tsx` | f75b3ea9 | 3 | NONE (diff regions) |
| `packages/client/src/lib/event-reducer.ts` | f75b3ea9 + 8a271b60 | 1 | NONE (diff cases) |
| `packages/flows-plugin/src/client/SessionFlowActions.tsx` | 3 of our commits | 1 | LOW |
| `openspec/specs/dashboard-plugin-loader/spec.md` | 47e3b12d | 1 (e18c0b8d) | LOW |
| `scripts/sync-versions.js` | 2c31067d | 1 | LOW |
| `package-lock.json` | 2c31067d + 8a271b60 + f706218f | 2 | LOW (regenerable) |
| `vitest.config.ts` | 8a271b60 | 1 | LOW |

## Per-conflict resolution recipes

### HIGH-RISK #1 — `packages/client/src/components/SessionCard.tsx`

**Origin commits touching it:**
- `4b09825b` — redesign session-card and folder-header (subcards, gutter, status icon)
- `1ace4bc5` — status-tinted capsule rail + icon chip on gutter
- `1b3d7b72` — hide empty FLOWS subcard
- `36f9e994` — show session status + selection on linked-session pills
- `03561d10` — restore mdiConsoleLine import + chrome ErrorBoundary

**Our commit:**
- `f75b3ea9` — delete imports of FlowActivityBadge, SessionFlowActions; remove 3 JSX call sites

**Conflict zone:** lines ~641-656 where origin wraps FLOWS content in `<SessionSubcard>` and we delete the FLOWS content entirely.

**Resolution recipe:**
1. At the conflict marker, keep origin's structural changes (subcard wrappers for OPENSPEC, PROCESS, MEMORY).
2. Delete the FLOWS subcard wrapper entirely — it was added by origin but we have no flow content for it. Origin's `1b3d7b72` already hides it on empty state; we go further and remove it.
3. Keep our removed imports (`FlowActivityBadge`, `SessionFlowActions`).
4. Verify visually: open the dashboard in `npm run dev` and confirm session cards render the new subcard layout WITHOUT a FLOWS section.

**Expected output:** SessionCard with subcards for OPENSPEC, PROCESS, MEMORY (origin's design), zero FLOWS references (our intent).

### HIGH-RISK #2 — `packages/client/src/components/AgentCardShell.tsx`

**Origin commits:**
- `ae59eed5` — UI(AgentCardShell): blend secondary+tertiary bg for unselected cards (one CSS line change)

**Our commit:**
- `8a271b60` — replaces entire 57-line file with a 3-line re-export shim pointing to `packages/client-utils/src/AgentCardShell.tsx` (where the real implementation was moved)

**Conflict type:** delete-vs-modify. Git will flag because:
- Their HEAD: full file with one CSS line modified
- Our HEAD: 3-line shim, original file content gone

**Resolution recipe:**
1. Choose "ours" for `packages/client/src/components/AgentCardShell.tsx` — keep the re-export shim. The file is now a thin pointer; CSS belongs in the actual implementation.
2. Open `packages/client-utils/src/AgentCardShell.tsx` (the new home of the implementation, copied verbatim by 8a271b60).
3. Apply origin's `ae59eed5` CSS change to that file:
   - Find the line that previously rendered the card background.
   - Apply the same color-mix / blend logic origin added.
4. Run `npm run build` to confirm both packages compile.
5. Visual verification: unselected cards show the new blended background.

**Expected output:** Re-export shim in client-package, actual styling logic in client-utils package with origin's CSS blend applied.

### MEDIUM-RISK #1 — `AGENTS.md`

**Origin commits adding rows:** `e2cd03b3`, `e8ebb95c`, `0446bf82`, `e0c60fa8` (4 commits — RPC keeper, slash dispatch, server launch unification, npm-trusted-publishing release fix).

**Our commit:** `1d02fbf4` — adds row about flows-plugin's plugin-runtime UI primitives.

**Conflict type:** additive insertions to the "Key Files" table. Both sides add new rows but at different line offsets.

**Resolution recipe:**
1. Accept both sets of additions.
2. Verify the table is logically ordered (the AGENTS.md protocol says rows ≤ 200 chars, path-alphabetical-ish within each subsection).
3. If our flows-plugin row collides with origin's added row at the same path-prefix, position ours just below the most-related origin row.

### MEDIUM-RISK #2 — `packages/dashboard-plugin-runtime/src/slot-consumers.tsx`

**Origin commit:** `4b09825b` added new slot consumer functions:
- `useSlotHasClaimsForSession`
- `SessionCardMemorySlot`
- `WorkspaceActionBarSlot`

**Our commits (sequential):**
- `f706218f` — added `forRoute` filter to ContentViewSlot (later reverted)
- `2d248280` — removed `forRoute`, replaced with `forSession` predicate filter

**Conflict type:** structural rewrite. Origin's adds new functions; our sequential rewrites change ContentViewSlot's filter logic. The two are conceptually orthogonal but live in the same file.

**Resolution recipe:**
1. Let `f706218f` apply first (adds `forRoute`).
2. Let `2d248280` apply on top (removes `forRoute`, switches to `forSession`).
3. POST-MERGE verification: read the final `slot-consumers.tsx` and confirm it contains:
   - Our `forSession`-based ContentViewSlot ✓
   - Origin's new `useSlotHasClaimsForSession`, `SessionCardMemorySlot`, `WorkspaceActionBarSlot` ✓
4. If any of origin's new functions are missing, manually copy them from `git show origin/develop:packages/dashboard-plugin-runtime/src/slot-consumers.tsx`.

### LOW-RISK file-by-file

- **`CHANGELOG.md`** — Origin adds to Changed/Fixed sections; we add to Added section. Adjacent sections, expect whitespace conflict. Resolution: keep section ordering (Added → Changed → Fixed → Removed) per Keep-a-Changelog.

- **`packages/client/src/App.tsx`** — Origin's changes (BootstrapBanner prop, ErrorBoundary) are at lines 1400+. Our changes (`f75b3ea9` deletions, `2d248280` ContentViewSlot revert) are at lines 10-1000. 3-way merge handles cleanly.

- **`packages/extension/src/bridge.ts`** — Origin's `e2cd03b3` adds `tryDispatchExtensionCommand` at line ~720 (sessionPrompt function). Our `1f6a78e2` rewrites message_end handler at lines ~896-940. Different functions, no overlap.

- **`packages/flows-plugin/src/client/SessionFlowActions.tsx`** — Origin's only change is UI removal at lines ~40-45. Our commits add primitives + slot-claim wrapper at end. Different regions.

- **`openspec/specs/dashboard-plugin-loader/spec.md`** — Origin's `e18c0b8d` added requirements at lines 35-70 and 478-507. Our `47e3b12d` added requirements via archive sync at later anchor points. Both additive, 3-way merge expected clean.

- **`package-lock.json`** — Always likely to conflict; just regenerate with `npm install` after the rebase finishes.

- **`scripts/sync-versions.js`** and **`vitest.config.ts`** — single-commit overlaps from origin; our changes are surgical. Expect clean 3-way merge.

## Verification protocol

After EVERY conflict resolution and `git rebase --continue`:

```bash
# Sanity check the in-progress rebase
git status
git log --oneline -5    # confirm last commit message

# After all 18 commits replayed:
npm run reload:check    # type-check
npm test 2>&1 | tee /tmp/post-rebase-test.log
grep -nE 'FAIL|Error|✗' /tmp/post-rebase-test.log
openspec validate --all --strict 2>&1 | grep -E '(dashboard-plugin-loader|dashboard-shell-slots|plugin-ui-primitive)'
npm run build
```

If ANY gate fails, do NOT push. Investigate, fix forward, or abort the rebase (`git rebase --abort`) and re-plan.

## Backup strategy

Before starting the rebase:

```bash
git branch develop-prerebase-$(date +%Y%m%d-%H%M%S)
```

This pins the current HEAD (`b0566863`) under a recoverable name. If the rebase produces an unacceptable result and you cannot reach a clean state, restore with:

```bash
git rebase --abort                 # if mid-rebase
git reset --hard develop-prerebase-<timestamp>
```

The backup branch can be deleted with `git branch -D develop-prerebase-...` once the push succeeds.

## Architectural decision deferred

The proposal `pi-flows-adopt-extension-ui` on origin (`47b8865c`) proposes flows adopting the extension-ui descriptor system. Our `pluginize-flows-via-registry` (archived in `47e3b12d`) takes the plugin-runtime path. Both can survive the rebase — they don't share code. The decision about which is canonical is **deferred to a separate proposal** (`reconcile-flows-extension-ui-vs-plugin-runtime` or similar).

The rebase is mechanical; the architectural call is conceptual. Don't conflate them.
