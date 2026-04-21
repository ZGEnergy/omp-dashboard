# Design — bootstrap-resolution-harness

This document captures the full exploration (2026-04-20 conversation with robson) that led to this change. Nothing from that conversation should be lost on implementation.

## 1. Fragility surface (why this exists)

```
┌──────────────────────────────────────────────────────────────────┐
│  Axis                 │  Fragile because…                        │
├───────────────────────┼──────────────────────────────────────────┤
│  pi install location  │  global npm / managed ~/.pi-dashboard /  │
│                       │  bare-import / absent                    │
│  cwd                  │  spaces, unicode, "Program Files (x86)"  │
│  app launch path      │  /Applications vs AppImage vs NSIS vs    │
│                       │  unpacked dev build                      │
│  tool registry        │  5 tools × 5 strategies → 25 paths       │
│  HOME drift           │  $HOME differs from os.homedir in some   │
│                       │  sandboxed launches (Git Bash on Win)    │
│  OS separators        │  backslash, drive letters, case folding  │
│  PATH shape           │  user shell PATH ≠ GUI-launched PATH     │
│  settings.json state  │  missing / empty / valid / malformed /   │
│                       │  other-packages-present                  │
│  bridge registration  │  absent / valid / stale / AppImage-tmp   │
└──────────────────────────────────────────────────────────────────┘
```

## 2. State lattice

Bootstrap is actually **three independent resolution problems**:

```
 ┌─────────────────────────────┐   ┌───────────────────────────┐   ┌──────────────────────┐
 │  TOOL RESOLUTION            │   │  BRIDGE REGISTRATION       │   │  INSTANCE UNIQUENESS │
 │                             │   │                            │   │                      │
 │ Where are pi, node, openspec,│   │ Does pi know about the     │   │ Is another dashboard │
 │ tsx, npm?                   │   │ bridge extension?          │   │ already running?     │
 │ → ToolRegistry              │   │ → settings.json mutation   │   │ → lock + health +    │
 │                             │   │                            │   │   mDNS               │
 │ Pure: fs.existsSync + PATH  │   │ Pure: JSON read/write      │   │ Deferred to (3)      │
 └─────────────────────────────┘   └───────────────────────────┘   └──────────────────────┘
```

This harness covers the first two. Instance-uniqueness scenarios land with proposal `single-dashboard-per-home`.

## 3. The "pi state" axis is three states, not two

A critical insight from exploration: "pi installed" silently collapses three distinct states:

```
   pi ABSENT        pi + NO EXTENSION        pi + EXTENSION
       │                    │                       │
       ▼                    ▼                       ▼
   dashboard can      dashboard can boot,    dashboard + sessions
   install pi         register extension     work end-to-end
   (Electron only!)   on next startup
```

Each produces a distinct outcome. Tests must cover all three per scenario family.

## 4. Outcome-grouped scenario families (the real table)

Rather than enumerating the combinatorial cube, group by user-visible outcome:

```
┌── FAMILY ──────────────────┬ dashboard ┬ pi     ┬ bridge in ──┬ OUTCOME ─────────────────┐
│                            │           │        │ settings    │                          │
├────────────────────────────┼───────────┼────────┼─────────────┼──────────────────────────┤
│ "fresh user"               │  any      │ –      │ –           │ dashboard starts,        │
│                            │           │        │             │ bootstrap installer runs │
│                            │           │        │             │ (proposal 2)             │
│ "returning pi user"        │  any      │ ✓      │ missing     │ dashboard registers      │
│                            │           │        │             │ bridge on boot           │
│ "upgrade in place"         │  any      │ ✓      │ stale path  │ dashboard replaces stale │
│ "happy path"               │  any      │ ✓      │ valid       │ no-op                    │
│ "AppImage first run"       │ AppImage  │ ✓      │ none        │ warning logged, no       │
│                            │           │        │             │ registration (expected)  │
│ "malformed settings"       │ any       │ ✓      │ json broken │ bail loudly              │
│ "dashboard absent, pi"     │ –         │ ✓      │ stale       │ bridge retries; stale    │
│                            │           │        │             │ remains until dashboard  │
│                            │           │        │             │ boots                    │
│ "two dashboards, one pi"   │ 2x        │ ✓      │ ???         │ DEFERRED to proposal (3) │
│ "HOME drift"               │ any       │ ✓      │ at $HOME    │ $HOME vs USERPROFILE vs  │
│                            │           │        │ or          │ os.homedir() — which     │
│                            │           │        │ os.homedir? │ path wins for write vs   │
│                            │           │        │             │ read must match          │
└────────────────────────────┴───────────┴────────┴─────────────┴──────────────────────────┘
```

## 5. Full scenario cube (for reference)

Final shape of the matrix:

```
   platform:   3   (win, mac, linux)
   × dash loc: 5   (electron, npm-g, dev, managed, absent)
   × pi state: 6   (absent, present+no-ext, +stale, +valid,
                    +malformed, +appimage-tmp)
   × settings: 4   (missing, empty, valid, malformed)
   × cwd/env:  3   (normal, spaces-unicode, HOME-drift)
   ──────────────
   = 1080 cells
   → realistic: ~25-40 curated "interesting" cells
```

**Decision (Q5 in exploration):** `(b) fail-closed` — auto-enumerate the cube and mark uninteresting cells as `.skip("reason")`. New cells without a decision break CI.

Implementation:
```ts
// pseudo-code
for (const cell of enumerateCube()) {
  const key = cellKey(cell);
  const registered = REGISTERED_SCENARIOS.get(key) ?? SKIPPED_SCENARIOS.get(key);
  if (!registered) {
    test.fails(`cell ${key} has no test and no skip — categorize it`);
  }
}
```

## 6. Initial ~25 curated cells

| Family | OS | Dash | Pi | Bridge | Settings | Env | Expected outcome |
|---|---|---|---|---|---|---|---|
| A1. electron-fresh | all 3 | bundled | absent | — | missing | normal | wizard triggers install (proposal 2 territory) |
| A2. electron-prewarmed | all 3 | bundled | managed | valid | valid | normal | all resolve to managed |
| A3. electron-global-pi | all 3 | bundled | npm-g | valid | valid | normal | pi via npm-g, bridge pointed at bundled |
| A4. electron-appimage-fresh | linux | appimage-tmp | managed | — | missing | normal | bridge registration logs warning, skipped |
| B1. npm-g-dash-only (⚠ bug) | win/mac/lin | npm-g | absent | — | missing | normal | pi unresolved — TRAIL SNAPSHOT locks in broken state; fix in proposal 2 |
| B2. npm-g-full | all 3 | npm-g | npm-g | valid | valid | normal | all npm-g |
| B3. npm-g-pi-installed-first | all 3 | npm-g | npm-g | missing | valid | normal | dashboard registers bridge on boot |
| C1. dev-monorepo | mac/lin | workspace | workspace | bare-import | valid | normal | all bare-import |
| C2. dev-monorepo-win | win | workspace | workspace | bare-import | valid | normal | Windows `.cmd` toArgv path |
| D1. override-valid | any | — | override | — | — | normal | pi resolves via override |
| D2. override-invalid-path | any | — | override (bad) | — | — | normal | falls through to next strategy |
| E1. stale-managed | any | bundled | managed v0.0.1 | valid | valid | normal | resolves + logs version-skew warning |
| E2. managed-pi-missing-after-npm-hiccup | any | bundled | managed (package.json only) | valid | valid | normal | strategy skips — deps not installed |
| F1. cwd-with-spaces | all 3 | bundled | managed | valid | valid | cwd="/tmp/my app" | resolves + spawn-argv safe |
| F2. cwd-unicode | all 3 | bundled | managed | valid | valid | cwd="/tmp/πρότζεκτ" | resolves |
| G1. win-cmd-shim | win | npm-g | npm-g | valid | valid | normal | pi.cmd found; toArgv prepends node.exe (no cmd flash) |
| G2. win-appdata-roaming | win | npm-g (roaming) | npm-g | valid | valid | APPDATA set | npm-global strategy finds at Roaming path |
| G3. win-programfiles-cwd | win | npm-g | managed | valid | valid | cwd="C:\Program Files (x86)\App" | resolves |
| G4. win-programfiles-node | win | npm-g | managed | valid | valid | node at `C:\Program Files\nodejs` | resolves |
| H1. home-drift-git-bash | win | npm-g | managed | valid | at $HOME | $HOME≠USERPROFILE | settings.json write/read use same path |
| H2. home-symlink | mac/lin | bundled | managed | valid | through symlink | realpath resolves same | resolves |
| I1. malformed-settings | any | bundled | managed | — | `{broken json` | normal | bootstrap bails with actionable error |
| I2. settings-other-packages | any | bundled | managed | valid | valid + unrelated packages | normal | non-destructive — others preserved |
| J1. path-gui-minimal | mac/lin | npm-g | npm-g | valid | valid | PATH=/usr/bin | still finds (npm-g strategy uses npm root -g, not PATH) |
| K1. dashboard-absent | any | absent | managed | valid | valid | normal | bridge points at nothing; no dashboard resolves |

## 7. Harness sketch

```
packages/shared/src/__tests__/bootstrap/
├── harness.ts              ← withFakeEnv() — memfs + env/platform shim
├── fixtures/
│   ├── electron-layout.ts
│   ├── npm-global-layout.ts
│   ├── managed-install.ts
│   ├── dev-monorepo.ts
│   ├── pi-versions.ts
│   └── settings-json.ts
├── scenarios.ts            ← REGISTERED_SCENARIOS + SKIPPED_SCENARIOS tables
├── cube.ts                 ← enumerateCube() + fail-closed check
├── assertions.ts           ← snapshotTrail(), snapshotSettings()
└── *.test.ts               ← one file per family (A, B, C, D, E, F, G, H, I, J, K)
```

Entry point:
```ts
withFakeEnv({
  platform: "win32",
  homedir:  "C:\\Users\\Róbert",
  cwd:      "C:\\Program Files (x86)\\Pi Dashboard",
  env:      { APPDATA: "C:\\Users\\Róbert\\AppData\\Roaming", PATH: "..." },
  fs: layer(
    fixtures.npmGlobalOnWindows({ pi: "0.6.3" }),
    fixtures.managedInstall({ pi: "0.5.1" }),
  ),
}, async (env) => {
  const registry = env.createRegistry();
  const res = registry.resolve("pi");
  expect(snapshotTrail(res)).toMatchSnapshot();
  expect(snapshotSettings(env)).toMatchSnapshot();
});
```

## 8. Trail snapshot format

Primary assertion — trail captures everything that matters:

```
source:   npm-global
path:     C:\Users\Róbert\AppData\Roaming\npm\node_modules\@mariozechner\pi\dist\cli.js
trail:
  override     ✗ no override set
  bare-import  ✗ @mariozechner/pi not resolvable from <anchor>
  managed      ✗ C:\Users\Róbert\.pi-dashboard\node_modules\...\cli.js does not exist
  npm-global   ✓ C:\Users\Róbert\AppData\Roaming\npm\node_modules\...\cli.js
toArgv:
  - C:\Program Files\nodejs\node.exe
  - C:\Users\Róbert\AppData\Roaming\npm\node_modules\...\cli.js
```

Snapshots normalize:
- Separators → forward-slash for string match (but keep original in `path` field)
- HOME prefix → `<HOME>` placeholder
- npm-root prefix → `<NPM_ROOT>` placeholder

## 9. settings.json snapshot format

```
path: <HOME>/.pi/agent/settings.json
before:
  packages:
    - /old/path/to/extension
    - <other-registration>
after:
  packages:
    - <HOME>/.pi-dashboard/node_modules/.../packages/extension  (newly added)
    - <other-registration>                                       (preserved)
  removed:
    - /old/path/to/extension                                     (stale, non-existent)
warnings:
  - (none) | "AppImage temp mount — skipping" | ...
```

## 10. Refactor prerequisites (before pure testing works)

```
┌──────────────────────────────────────────────────────────────────┐
│ Module                     │ Change required                     │
├────────────────────────────┼─────────────────────────────────────┤
│ strategies.ts              │ ✓ StrategyDeps already exists       │
│ bareImportStrategy         │ ⚠ uses real createRequire — accept  │
│                            │   resolveModule(id, from) in deps   │
│ managed-paths.ts           │ ⚠ reads os.homedir() at import time │
│                            │   — add getManagedDir({ homedir })  │
│                            │   getter alongside constant         │
│ bridge-register.ts         │ ✓ reads HOME at call-time already;  │
│                            │   just accept optional override     │
│ registry.ts                │ ✓ deps threading already in place   │
│ definitions.ts             │ ⚠ classify() is fine; toArgv reads  │
│                            │   platform from ctx — good          │
└──────────────────────────────────────────────────────────────────┘
```

Chosen approach (Q1 in exploration): **lazy getters** (minimal invasive). `MANAGED_DIR` constant stays for back-compat; new `getManagedDir(env)` function is what tests use. Production call sites migrate opportunistically.

## 11. What this harness catches vs doesn't

```
┌────────────────────────────────┬─────────┬──────────┐
│ Bug class                      │ Caught? │ Notes    │
├────────────────────────────────┼─────────┼──────────┤
│ Strategy order wrong           │  ✓      │ snapshot │
│ Path normalization (win/posix) │  ✓      │ snapshot │
│ Version check logic            │  ✓      │ asserts  │
│ toArgv (no cmd flash)          │  ✓      │ asserts  │
│ PATH GUI-launched gap          │  ✓      │ fixture  │
│ "npm i -g dash only" gap       │  ✓      │ captured │
│ Spaces / unicode in cwd        │  ✓      │ fixture  │
│ HOME drift ($HOME vs os.home)  │  ✓      │ fixture  │
│ AppImage tmp mount rejection   │  ✓      │ fixture  │
│ Stale bridge registration      │  ✓      │ fixture  │
│ Malformed settings.json        │  ✓      │ fixture  │
├────────────────────────────────┼─────────┼──────────┤
│ Actual spawn behavior          │  ✗      │ Docker   │
│ code signing / Gatekeeper      │  ✗      │ VM       │
│ Installer UI (NSIS/dmg)        │  ✗      │ VM       │
│ Real Electron IPC              │  ✗      │ Xvfb     │
│ Process lifecycle (SIGTERM)    │  ✗      │ Docker   │
│ Lock file behavior             │  ✗      │ deferred │
│                                │         │ to prop. │
│                                │         │ (3)      │
└────────────────────────────────┴─────────┴──────────┘
```

Covers ~80% of reported bootstrap fragility. The remaining 20% stays in Docker + VM.

## 12. Alternatives considered

- **Option A — Matrix-ize `test-electron-install.sh` (Docker)**: slow (~60s per scenario), Linux-only, can't test Windows paths. Rejected as primary; kept as existing integration layer.
- **Option C — Xvfb + real Electron smoke**: catches real IPC, heavy. Out of scope; future work.
- **Option D — State-replay fixtures from user reports**: great idea but needs the harness first to consume them. Added as a follow-up direction — a fixture loader for `.tar.gz` snapshots of reported broken states.

## 13. Windows `npm i -g pi-dashboard` — exploration note

Exploration traced the root cause:

```
npm i -g pi-dashboard
         │
         ▼
 %AppData%\Roaming\npm\
  ├── pi-dashboard.cmd                    ← on PATH ✓
  └── node_modules/
       └── @blackbelt-technology/pi-dashboard-server/
             (runtime deps: fastify, ws, node-pty)
             (NOT deps: pi-coding-agent, openspec)

User runs `pi-dashboard` → ToolRegistry.resolve("pi") → ALL strategies miss → dashboard runs, no sessions ever appear.
```

Additionally: `findBundledExtension(baseDir)` looks for `<baseDir>/packages/extension/`. In an npm-g layout that's `node_modules/@blackbelt-technology/pi-dashboard-server/../../..` = `node_modules/` — no `packages/extension/` there. So bridge auto-registration silently no-ops too.

**This harness CAPTURES this as scenario B1.** The FIX lives in proposal `unified-bootstrap-install`. Once that lands, B1's expected outcome flips from "unresolved" to "resolves via managed after first-run bootstrap."

## 14. Dependencies on proposals (2) and (3)

- Proposal `unified-bootstrap-install` will flip scenario B1's expected outcome. Coordinate: (2) updates the B1 snapshot as part of its task list.
- Proposal `single-dashboard-per-home` adds scenarios L1–L8 (lock-file states). Coordinate: (3) adds them; this change doesn't anticipate their shape.

## 15. Open items for implementer

1. **Placement**: harness in `packages/shared/src/__tests__/bootstrap/` or in a new `packages/test-support/` workspace? Decision criterion: does server or electron need to *run* the harness (only tests do → shared is fine)?
2. **memfs library choice**: `memfs` (npm) vs hand-rolled minimal shim. `memfs` is ~100KB and battle-tested. Hand-rolled would need `readFileSync`/`existsSync`/`statSync`/`readdirSync`. Lean toward `memfs`.
3. **`process.platform` shim**: cannot be replaced at runtime. Either (a) thread `platform` through everything (already partly done via `toArgv` ctx) or (b) use `vi.stubGlobal`. Prefer (a) — purity.
4. **Snapshot stability on Windows CI**: paths contain `\` vs `/`; normalize before snapshotting to avoid cross-OS diffs.
