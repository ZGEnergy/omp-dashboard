# File Index — Knowledge base

> Part of [pi-agent-dashboard file index](./file-index.md). Loaded on demand.
>
> **Change-history annotations** (e.g. *"See change: foo-bar"*) → OpenSpec changes archived under `openspec/changes/archive/`.
>
> **Update protocol**: see `AGENTS.md` → "Documentation Update Protocol".

> Wired into project via `.pi/settings.json` extensions list as `+packages/kb-extension/src/index.ts`.

| File | Purpose |
|------|---------|
| `packages/kb-extension/package.json` | npm manifest. name @blackbelt-technology/pi-dashboard-kb-extension. peer deps pi-coding-agent. |
| `packages/kb-extension/src/__tests__/reindex.test.ts` | vitest suite for reindex logic. |
| `packages/kb-extension/src/extension.ts` | Extension entry. Registers kb_search/kb_neighbors/kb_get native tools. tool_result hook: Job 1 md write→debounced hash-gated reindex; Job 2 opt-in doxEnforcement nudge (default OFF, KB_DOX_ENFORCEMENT=1 forces on). Isolated standalone extension, not in bridge.ts. |
| `packages/kb-extension/src/index.ts` | Barrel. Re-exports extension default + reindex. |
| `packages/kb-extension/src/reindex.ts` | Pure reindex + DOX-nudge logic. No pi imports. Testable without running pi. |
| `packages/kb-plugin/package.json` | pi-dashboard-plugin manifest. id `kb`, priority 100. Claims `sidebar-folder-section`→`FolderKbSection`, `shell-overlay-route` `/folder/:encodedCwd/kb`→`KbSettingsClaim`. server `./src/server/index.ts`. Layer-3 dashboard plugin. Imports Layer-1 `@blackbelt-technology/pi-dashboard-kb`. Independent of Layer-2 kb-extension. See change: add-kb-folder-slot. |
| `packages/kb-plugin/src/client/FolderKbSection.tsx` | `sidebar-folder-section` claim. `deriveKbRowState` ordered five-state: error→indexing→not-indexed→stale→populated (error wins over chunks:0). Count tooltip `F files · N chunks`. `→` opens kb settings; reindex/Index now/Retry controls. See change: add-kb-folder-slot. |
| `packages/kb-plugin/src/client/KbSettingsClaim.tsx` | `shell-overlay-route` claim `/folder/:encodedCwd/kb`. Decodes cwd param, renders `KbSettingsPanel`. See change: add-kb-folder-slot. |
| `packages/kb-plugin/src/client/KbSettingsPanel.tsx` | Per-folder KB path editor. Edits sources[] (add/remove/reorder priority)/include/exclude/dbPath only; other config round-tripped. Shows origin + count. `Save + Reindex`. Worktree bootstrap: `Create project config` + `Copy from parent repo` (`parentRepoOf` derives parent from `.worktrees/` path). See change: add-kb-folder-slot. |
| `packages/kb-plugin/src/client/index.tsx` | Client barrel. Exports `FolderKbSection`, `KbSettingsClaim` for plugin-registry. See change: add-kb-folder-slot. |
| `packages/kb-plugin/src/client/kb-api.ts` | REST client. `fetchKbStats`/`reindexKb`/`fetchKbConfig`/`saveKbConfig`. base64url folder-path codec `encodeFolderPath`/`decodeFolderPath`, `kbSettingsUrl`. Content-type guard: non-JSON body → typed error not parse crash. See change: add-kb-folder-slot. |
| `packages/kb-plugin/src/client/useKbConfig.ts` | `useKbConfig(cwd)`. GET config, `save(patch)` PUT. Round-trips full config. See change: add-kb-folder-slot. |
| `packages/kb-plugin/src/client/useKbStats.ts` | `useKbStats(cwd)`. Fetch `/api/kb/stats`, `reindex()` POST. Polls every 1000ms while `indexing`, stops on settle. See change: add-kb-folder-slot. |
| `packages/kb-plugin/src/server/index.ts` | Server entry `registerPlugin`. Mounts `/api/kb/*` routes via `mountKbRoutes`. Consumes host service `host.knownFolderCwds` for cwd validation; falls back to session cwds. See change: add-kb-folder-slot. |
| `packages/kb-plugin/src/server/job-registry.ts` | `KbJobRegistry`. Per-cwd reindex coalescing. `start` sets running synchronously; concurrent start coalesced onto in-flight promise. `statusFor` → `idle|running|error`. Failed job retains `error`; later success clears to idle. See change: add-kb-folder-slot. |
| `packages/kb-plugin/src/server/kb-routes.ts` | `mountKbRoutes(fastify, {knownCwds, registry})`. Routes GET `/api/kb/stats`, POST `/api/kb/reindex`, GET/PUT `/api/kb/config`. Reuses `loadConfig`/`SqliteFtsStore`/`indexSource`/`validateConfig`. Validates cwd ∈ knownCwds (403 else, 400 missing). `countStale` reads `dox-staleness.json` (source-file drift only). `applyConfigPatch` merges path fields over project file, validateConfig then atomic tmp+rename write; sparse merged object persisted (untouched fields round-trip). Reindex session-less (no pi session). See change: add-kb-folder-slot. |
| `packages/kb-plugin/src/shared/kb-plugin-types.ts` | Client⇄server REST contract types. `KbStats {files,chunks,indexed,staleCount,indexing,jobStatus,lastError?}`, `KbConfigResponse`, `KbConfigPatch`, `KB_PLUGIN_ID`. type-only import KbConfig/SourceConfig from kb engine. See change: add-kb-folder-slot. |
| `packages/kb/eval/golden.doc-example.json` | Golden query→expected-path-substring set. Scores retrieval. |
| `packages/kb/eval/golden.doc-example.paraphrase.json` | Paraphrase golden set. Tracks paraphrase retrieval quality. |
| `packages/kb/package.json` | npm manifest. name @blackbelt-technology/pi-dashboard-kb. exports ./src/index.ts. type module. |
| `packages/kb/skill/kb-search/` | Skill dir. kb-search usage docs. |
| `packages/kb/skill/kb-setup/` | Skill dir. kb-setup usage docs. |
| `packages/kb/src/__tests__/kb.test.ts` | vitest suite for kb package. |
| `packages/kb/src/chunker.ts` | Structural heading chunker. Fence-safe, breadcrumb-aware. Line-based fenced-code state machine. |
| `packages/kb/src/cli.ts` | kb CLI. Commands index\|search\|neighbors\|backlinks\|get\|config. Dev run NODE_OPTIONS=--experimental-sqlite tsx src/cli.ts. |
| `packages/kb/src/config.ts` | Config layering. project .pi/dashboard/knowledge_base.json → global ~/.pi/dashboard/knowledge_base.json → defaults. No file-count cap default. |
| `packages/kb/src/dox.ts` | DOX tree. Directory-level AGENTS.md scaffold + audit. kb agents <path> nearest-applicable chain. Detect-don't-write: dox init/--fix fill PATH columns + prune orphans only. |
| `packages/kb/src/eval.ts` | Retrieval-quality eval. Scores search against golden set. Gates ranking changes. |
| `packages/kb/src/index.ts` | Public API barrel for @blackbelt-technology/pi-dashboard-kb. |
| `packages/kb/src/indexer.ts` | Indexer. Walks source, mtime→sha256 change detection, structural chunking, Tier-1 graph extraction, transactional upsert. |
| `packages/kb/src/init.ts` | kb init. Scaffolds + validates knowledge_base.json. --global writes global file. --force, --dry-run flags. gitignores dbPath. |
| `packages/kb/src/sources.ts` | Pluggable source resolvers. fs/npm/git/https → local dir. KB reads markdown only, never executes source. |
| `packages/kb/src/sqlite-store.ts` | Default KbStore backend over node:sqlite. FTS5. Zero runtime deps. Requires --experimental-sqlite. better-sqlite3 drop-in fallback. |
| `packages/kb/src/trust.ts` | TOFU trust store for remote sources. fs sources skip trust. npm/git/https confirm on first fetch. Keyed by sha256(canonical(SourceSpec)). |
| `packages/kb/src/types.ts` | KbStore interface + chunk types. Storage accessed only through KbStore. |
| `packages/kb/verify.ts` | verify script. NODE_OPTIONS=--experimental-sqlite tsx verify.ts. |
| `packages/kb/vitest.config.ts` | vitest config for kb package. |
