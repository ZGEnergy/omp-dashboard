# OMP Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship self-contained browser-only `@zgeenergy/omp-dashboard` for OMP `16.4.1` sessions.

**Architecture:** Root package publishes one built artifact. OMP loads bundled bridge, bridge and browser use separate loopback WebSockets, server owns OMP session projection and containment. Server-owned keeper owns headless OMP RPC child; bridge owns interactive OMP calls.

**Tech Stack:** Node `22`, TypeScript, esbuild, Vite, Fastify, `ws`, React, Vitest, OMP `16.4.1`.

## Global Constraints

- Target OMP exactly `16.4.1`.
- Require Node `22`; set package engine range `>=22 <23`.
- Publish only root `@zgeenergy/omp-dashboard` package.
- Publish `dist/extension/index.mjs`, `dist/server/cli.mjs`, `dist/web/**`.
- Set `package.json#omp.extensions` to `./dist/extension/index.mjs`.
- Do not ship runtime `@blackbelt-technology/*` dependency or import.
- Do not ship Electron, package manager, recommendation, provider, auth, catalogue, model proxy, mDNS, tunnel, pairing, OpenSpec, worktree, goal, automation, flow, role, injected-UI, editor, terminal, file-write, fork, or resume surfaces.
- Preserve upstream Electron sources, Electron tests/configs, Electron workflows, and legacy release helpers for rebase parity. Exclude them from the root artifact and root CI/publish/release path; do not delete them.
- Bind HTTP and WebSocket listeners only to `127.0.0.1` and/or `::1`.
- OMP plugin manager owns package install and link lifecycle.
- Never write Pi or OMP registration settings.
- Resolve the active root only from trusted server environment, source-equivalent to OMP `16.4.1`: `PI_CODING_AGENT_DIR`, then the `OMP_PROFILE` profile agent root (`PI_PROFILE` is legacy fallback only), then the default OMP/XDG agent root. Never accept an agent-dir value from browser or WebSocket input.
- Read OMP sessions only from `<agentDir>/sessions` and blobs only from `<agentDir>/blobs`.
- Write dashboard-owned state only under `<agentDir>/dashboard`.
- Never write session JSONL, journal, title slot, or blob.
- Keep bridge-server and browser-server loopback WebSocket protocols.
- Keep JSONL stdio only between keeper and its `omp --mode rpc` child.
- Keep OMP RPC child `stdout` protocol-only JSONL; diagnostics go to `stderr` or logger.
- Canonical OMP `sessionId` scopes session, control, process, replay, and file operations.
- Persist event before browser broadcast.
- Preserve `register -> replay -> buffered live -> complete` order per session.
- Keep reconnect replay ascending after acknowledged sequence; never duplicate or interleave.
- Interactive TUI slash command returns structured `unavailable`; only live dashboard-owned keeper dispatches headless slash command.
- File read canonicalizes path under selected session read root; reject absolute, `..`, and post-resolution symlink escape.
- Process action accepts only registered dashboard handle owned by selected `sessionId`; reject raw PID, unknown, and cross-session handle.

---

## File Structure

### Root distribution and release

- Modify: `package.json` — root package identity, `omp.extensions`, build/test/pack commands, root-only allowlist, Node `22`, direct `esbuild` dev dependency.
- Modify: `package-lock.json` — lock root direct `esbuild` dependency and root package identity.
- Create: `scripts/build-omp-dist.mjs` — Vite web build plus esbuild Node ESM bundles.
- Create: `scripts/verify-omp-dist.mjs` — release artifact contract verifier.
- Create: `scripts/__tests__/omp-dist-contract.test.mjs` — package and emitted-file contract tests.
- Modify: `packages/client/vite.config.ts` — write browser build to root `dist/web`.
- Modify: `packages/client/scripts/precompress.mjs` — gzip root `dist/web` assets.
- Modify: `scripts/test-standalone-npm-install.sh` — root tarball install smoke.
- Modify: `scripts/test-standalone-npm-install.ps1` — Windows root tarball smoke.
- Modify: `.github/workflows/ci.yml`, `.github/workflows/_smoke.yml`, `.github/workflows/ci-smoke.yml`, `.github/workflows/publish.yml` — root-artifact gates only.
- Retain upstream `packages/electron/`, `tests/e2e-electron/`, Electron Playwright config, Electron workflows, and legacy release helper scripts for rebase parity. Root packaging and the modified root CI/publish workflows must neither package nor invoke Electron build, publish, or release jobs.

### Shared OMP model and persistence

- Modify: `packages/shared/src/dashboard-paths.ts` — agent-root and dashboard-root resolution.
- Modify: `packages/shared/src/config.ts` — OMP-only config and agent-dir injection.
- Modify: `packages/shared/src/session-meta.ts` — dashboard-owned metadata keyed by `sessionId`.
- Modify: `packages/shared/src/state-replay.ts` — OMP v3 header, title slot, `model_change`, thinking level, blobs, and ID-parent replay.
- Modify: `packages/shared/src/protocol.ts` — narrow bridge-server union.
- Modify: `packages/shared/src/browser-protocol.ts` — narrow browser-server union.
- Modify: `packages/shared/src/types.ts` — OMP session projection and core UI types.
- Modify tests: `packages/shared/src/__tests__/dashboard-paths.test.ts`, `config.test.ts`, `session-meta.test.ts`, `state-replay-entry-id.test.ts`, `state-replay-flow-events.test.ts`, `protocol.test.ts`, `browser-protocol-types.test.ts`.
- Create fixtures: `packages/shared/src/__fixtures__/omp-v16.4.1/slot-title.session.jsonl`, `header-title.session.jsonl`, `model-thinking.session.jsonl`, `blobs/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

### Server OMP core

- Modify: `packages/server/src/session-scanner.ts`, `session-discovery.ts`, `session-file-reader.ts`, `session-load-worker.ts`, `session-load-worker-pool.ts`, `session-stats-reader.ts`, `session-bootstrap.ts`, `meta-persistence.ts`, `directory-service.ts` — read OMP session tree and dashboard state only.
- Modify: `packages/server/src/server.ts`, `cli.ts` — loopback core server, bundle-relative static assets, direct `.mjs` launch guard.
- Modify: `packages/server/src/pi-gateway.ts`, `browser-gateway.ts`, `event-wiring.ts`, `memory-session-manager.ts`, `memory-event-store.ts` — core bridge/browser gateways and ordered projection.
- Modify: `packages/server/src/browser-handlers/subscription-handler.ts`, `session-action-handler.ts` — subscription, prompt, abort, headless slash, process actions only.
- Modify: `packages/server/src/file-routes.ts`, `preferences-display-routes.ts`, `session-routes.ts` — read-only file and display preference routes only.
- Modify: `packages/server/src/process-manager.ts`, `headless-pid-registry.ts`, `rpc-keeper/keeper-manager.ts`, `rpc-keeper/keeper.cjs`, `rpc-keeper/dispatch-router.ts` — keeper and owned-process control.
- Modify retained request-handler registrations so the dashboard core exposes no writer, fork, or resume request path; retain upstream source files rather than deleting them.

### OMP bridge

- Modify: `packages/extension/src/bridge.ts`, `connection.ts`, `event-forwarder.ts`, `session-sync.ts`, `bridge-context.ts`, `slash-dispatch.ts`, `server-launcher.ts`.
- Modify retained bridge entry paths so the core bridge imports and calls none of the provider/catalogue, role/flow, mDNS, default-model, UI-module, context-injection, file-mutation, or Pi-only command-dispatch surfaces.
- Modify tests: `packages/extension/src/__tests__/connection.test.ts`, `connection-dropped-frames.test.ts`, `session-sync.test.ts`, `session-switch.test.ts`, `event-forwarder.test.ts`, `bridge-retry-ordering.test.ts`, `bridge-abort-orderer.test.ts`, `server-launcher.test.ts`.

### Browser core

- Modify: `packages/client/src/main.tsx`, `App.tsx` — only `/` and `/session/:id` composition.
- Modify: `packages/client/src/hooks/useWebSocket.ts`, `useMessageHandler.ts`, `useSessionActions.ts`, `event-reducer.ts` — core protocol state and actions.
- Modify or extract: `packages/client/src/components/ChatView.tsx`, `ToolCallStep.tsx`, `CommandInput.tsx`, `ProcessList.tsx`, `FilePreviewOverlay.tsx`, `interactive-renderers/registry.tsx` — core transcript, composer, built-in interactive prompts, owned process drawer, read-only preview.
- Retain and narrow: `packages/client/src/hooks/useViewDispatcher.ts`, `useDisplayPrefs.ts`, `packages/client/src/contexts/DisplayPrefsContext.tsx`, `FilePreviewContext.tsx`, `components/FirstLaunchDisplayModal.tsx`, `encodePromptAnswer.ts`.
- Modify core browser entry paths so they expose no client plugin runtime, extension UI, settings, OpenSpec, worktree, editor, terminal, provider/model, flow, goal, role, catalogue, package, or recommendation route/control; retain upstream source for rebase parity.
- Modify tests: `packages/client/src/hooks/__tests__/useViewDispatcher.test.ts`, `useDisplayPrefs.test.tsx`, `useSessionActions.optimistic-prompt.test.tsx`, `packages/client/src/__tests__/use-message-handler-pending-prompt.test.ts`, `state-replay.test.ts`, `components/__tests__/ProcessList.test.tsx`, `CommandInput.test.tsx`, `FilePreviewOverlay.test.tsx`.
- Create tests: `packages/client/src/__tests__/CoreApp.session-view.test.tsx`, `CoreApp.live-replay.test.tsx`, `CoreApp.prompts.test.tsx`, `CoreApp.abort-and-process.test.tsx`, `CoreApp.display-prefs.test.tsx`.

## Task 1: Publish One Root Artifact

**Files:**
- Modify: `package.json:1-139`
- Modify: `package-lock.json:1-70`
- Create: `scripts/__tests__/omp-dist-contract.test.mjs`
- Test: `scripts/__tests__/omp-dist-contract.test.mjs`

**Interfaces:**
- Consumes: npm pack manifest and Node package metadata.
- Produces: `package.json#name`, `engines.node`, `omp.extensions`, `files`, `scripts.build`, `scripts.verify:omp-dist`.
- Produces: root package contract: `{ name: "@zgeenergy/omp-dashboard", extension: "./dist/extension/index.mjs", server: "dist/server/cli.mjs", web: "dist/web/index.html" }`.

- [ ] **Step 1: Write failing root-artifact test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url)));

test("root package declares only OMP extension artifact", () => {
  assert.equal(pkg.name, "@zgeenergy/omp-dashboard");
  assert.deepEqual(pkg.omp.extensions, ["./dist/extension/index.mjs"]);
  assert.deepEqual(pkg.files, ["dist/"]);
  assert.equal(pkg.engines.node, ">=22 <23");
  assert.equal(Object.keys(pkg.dependencies ?? {}).some((name) => name.startsWith("@blackbelt-technology/")), false);
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `node --test scripts/__tests__/omp-dist-contract.test.mjs`

Expected: FAIL because package name, `pi.extensions`, raw-source allowlist, and BlackBelt runtime dependencies remain.

- [ ] **Step 3: Replace root metadata with OMP artifact contract**

```json
{
  "name": "@zgeenergy/omp-dashboard",
  "type": "module",
  "engines": { "node": ">=22 <23" },
  "omp": { "extensions": ["./dist/extension/index.mjs"] },
  "files": ["dist/"],
  "scripts": {
    "build": "node scripts/build-omp-dist.mjs",
    "verify:omp-dist": "node scripts/verify-omp-dist.mjs"
  },
  "devDependencies": { "esbuild": "^0.25.0" }
}
```

Set root metadata so it declares no `pi`, workspace publication, raw-source `main`/`bin`, `@blackbelt-technology/*` runtime dependency, Electron script, package-manager script, or obsolete peer declaration. Retain upstream files and scripts in the repository; root package metadata must neither ship nor invoke them. Keep only dependencies required after bundle inspection; each retained runtime dependency must resolve from package contents or Node `22` built-ins.

- [ ] **Step 4: Run test and confirm pass**

Run: `node --test scripts/__tests__/omp-dist-contract.test.mjs`

Expected: PASS; package declares one OMP extension and no BlackBelt runtime dependency.

- [ ] **Step 5: Commit root package contract**

```bash
git add package.json package-lock.json scripts/__tests__/omp-dist-contract.test.mjs
git commit -m "feat: publish omp dashboard root artifact"
```

### Task 2: Build and Verify Self-Contained Distribution

**Files:**
- Create: `scripts/build-omp-dist.mjs`
- Create: `scripts/verify-omp-dist.mjs`
- Modify: `packages/client/vite.config.ts:63-128`
- Modify: `packages/client/scripts/precompress.mjs:19-21`
- Modify: `packages/extension/src/server-launcher.ts:7-64`
- Modify: `packages/server/src/server.ts:1380-1503`
- Modify: `packages/server/src/cli.ts:503-512`
- Modify: `packages/extension/src/__tests__/server-launcher.test.ts`
- Modify: `packages/server/src/__tests__/client-discovery.test.ts`, `spa-fallback.test.ts`, `pi-dashboard-bin-wrapper.test.ts`, `cli-version.test.ts`
- Test: `scripts/__tests__/omp-dist-contract.test.mjs`, listed extension and server tests.

**Interfaces:**
- Consumes: root `build` script, `packages/extension/src/bridge.ts`, `packages/server/src/cli.ts`, Vite browser build.
- Produces: `buildOmpDist(): Promise<void>`.
- Produces: `resolveServerCliPath(bundleFileUrl: string): string` returning package-local `dist/server/cli.mjs`.
- Produces: `resolveWebRoot(bundleFileUrl: string): string` returning package-local `dist/web`.
- Produces: `verifyOmpDist(distRoot: string): Promise<void>`.

- [ ] **Step 1: Extend failing artifact test for emitted files and imports**

```js
test("distribution contains runtime entrypoints and no BlackBelt import", async () => {
  const required = ["dist/extension/index.mjs", "dist/server/cli.mjs", "dist/web/index.html"];
  for (const relativePath of required) await access(new URL(`../../${relativePath}`, import.meta.url));
  const nodeBundles = await Promise.all(required.slice(0, 2).map((p) => readFile(new URL(`../../${p}`, import.meta.url), "utf8")));
  assert.equal(nodeBundles.join("\n").includes("@blackbelt-technology/"), false);
});
```

- [ ] **Step 2: Run build contract and confirm failure**

Run: `npm run build && node --test scripts/__tests__/omp-dist-contract.test.mjs`

Expected: FAIL because root build does not create required `dist/**` paths.

- [ ] **Step 3: Implement root build, package-local resolution, and static serving**

```js
// scripts/build-omp-dist.mjs
await build({ entryPoints: ["packages/extension/src/bridge.ts"], outfile: "dist/extension/index.mjs", bundle: true, platform: "node", format: "esm", target: "node22", splitting: false, external: OMP_LOADER_IMPORTS });
await build({ entryPoints: ["packages/server/src/cli.ts"], outfile: "dist/server/cli.mjs", bundle: true, platform: "node", format: "esm", target: "node22", splitting: false });
```

```ts
// packages/extension/src/server-launcher.ts
export function resolveServerCliPath(bundleFileUrl = import.meta.url): string {
  return fileURLToPath(new URL("../server/cli.mjs", bundleFileUrl));
}
```

```ts
// packages/server/src/server.ts
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
await fastify.register(fastifyStatic, { root: webRoot, prefix: "/", preCompressed: true });
```

Set Vite `build.outDir` to `../../../dist/web`. Set precompress `distDir` to `../../../dist/web`. Externalize only documented OMP loader compatibility imports from extension bundle. Fail verifier for emitted `@blackbelt-technology/` import, non-empty matching metafile external, missing entrypoint, missing asset linked by `index.html`, or absent `.gz` sibling for compressible built asset. Add `.endsWith("cli.mjs")` to CLI direct-execution guard. Replace legacy module resolver, sibling, monorepo, and API-only static path logic with bundle-relative resolution.

- [ ] **Step 4: Run focused distribution tests and confirm pass**

Run: `npm run build && npm test -- scripts/__tests__/omp-dist-contract.test.mjs packages/extension/src/__tests__/server-launcher.test.ts packages/server/src/__tests__/client-discovery.test.ts packages/server/src/__tests__/spa-fallback.test.ts packages/server/src/__tests__/pi-dashboard-bin-wrapper.test.ts packages/server/src/__tests__/cli-version.test.ts`

Expected: PASS; verifier reports all three entrypoints, static SPA fallback works, and compiled CLI executes directly.

- [ ] **Step 5: Commit distribution build**

```bash
git add package.json scripts/build-omp-dist.mjs scripts/verify-omp-dist.mjs scripts/__tests__/omp-dist-contract.test.mjs packages/client/vite.config.ts packages/client/scripts/precompress.mjs packages/extension/src/server-launcher.ts packages/extension/src/__tests__/server-launcher.test.ts packages/server/src/server.ts packages/server/src/cli.ts packages/server/src/__tests__/client-discovery.test.ts packages/server/src/__tests__/spa-fallback.test.ts packages/server/src/__tests__/pi-dashboard-bin-wrapper.test.ts packages/server/src/__tests__/cli-version.test.ts
git commit -m "feat: bundle omp dashboard distribution"
```

### Task 3: Resolve OMP Roots and Read Sessions Without Source Writes

**Files:**
- Modify: `packages/shared/src/dashboard-paths.ts:35-120`, `config.ts:12-13,700-828`, `session-meta.ts:12-207`, `state-replay.ts:35-221`
- Modify: `packages/server/src/session-scanner.ts:1-298`, `session-discovery.ts:1-142`, `session-file-reader.ts:1-135`, `session-load-worker.ts:22-79`, `session-load-worker-pool.ts:29-33,96-307`, `session-stats-reader.ts:21-99`, `meta-persistence.ts:11-140`, `session-bootstrap.ts:20-62`, `directory-service.ts:420-469`
- Create: `packages/shared/src/__fixtures__/omp-v16.4.1/slot-title.session.jsonl`, `header-title.session.jsonl`, `model-thinking.session.jsonl`, `blobs/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- Create: `packages/server/src/__tests__/session-stats-reader.test.ts`, `omp-session-read-only.integration.test.ts`
- Modify: `packages/shared/src/__tests__/dashboard-paths.test.ts`, `config.test.ts`, `session-meta.test.ts`, `state-replay-entry-id.test.ts`, `state-replay-flow-events.test.ts`; `packages/server/src/__tests__/session-scanner.test.ts`, `session-scanner-resolve-dir.integration.test.ts`, `session-load-worker.test.ts`, `meta-persistence.test.ts`
- Retain upstream `session-file-reader`, fork JSONL, and fork preflight tests for rebase parity; exclude them from the focused dashboard-core test selection rather than deleting them.

**Interfaces:**
- Consumes: trusted server process environment (`PI_CODING_AGENT_DIR`, `OMP_PROFILE`, legacy `PI_PROFILE`, and OMP/XDG home inputs), OMP profile data, OMP session JSONL, `<agentDir>/blobs`.
- Produces: server-only `resolveAgentPaths(env?: NodeJS.ProcessEnv): AgentPaths`, which defaults to `process.env` and has no browser or WebSocket agent-dir parameter, with `sessionsDir`, `dashboardDir`, and `blobsDir` getters.
- Produces: `readOmpSession(file, paths): Promise<OmpSessionProjection>`.
- Produces: `loadSessionMeta(agentDir, sessionId): Promise<SessionMeta | null>` and `saveSessionMeta(agentDir, sessionId, patch): Promise<SessionMeta>`.
- Produces: `OmpSessionProjection` with `{ sessionId, titleSlot, headerTitle, titleSource, entries, blobRefs }`.

- [ ] **Step 1: Write failing OMP roots, slot, blob, and immutability tests**

```ts
it("uses OMP agent root and keeps every read path immutable", async () => {
  const paths = await withProcessEnv({
    ...fixture.ompEnv,
    PI_CODING_AGENT_DIR: fixture.agentDir,
    OMP_PROFILE: "work",
    PI_PROFILE: "legacy",
    XDG_DATA_HOME: fixture.xdgDataHome,
  }, () => resolveAgentPaths());
  expect(paths).toMatchObject({ sessionsDir: `${fixture.agentDir}/sessions`, dashboardDir: `${fixture.agentDir}/dashboard`, blobsDir: `${fixture.agentDir}/blobs` });
  const before = await snapshotTree(paths.sessionsDir);
  const projection = await readOmpSession(fixture.sessionFile, paths);
  expect(projection.titleSlot).toBe("Physical title");
  expect(projection.headerTitle).toBe("Header title");
  expect(projection.entries).toContainEqual(expect.objectContaining({ type: "model_change", model: "provider/model-id" }));
  expect(projection.entries).toContainEqual(expect.objectContaining({ type: "thinking_level_change", thinkingLevel: "high" }));
  expect(await snapshotTree(paths.sessionsDir)).toEqual(before);
  expect(await exists(`${paths.dashboardDir}/${projection.sessionId}.json`)).toBe(false);
});
```

```ts
it.each([
  ["explicit PI_CODING_AGENT_DIR", { PI_CODING_AGENT_DIR: fixture.explicitAgentDir, OMP_PROFILE: "work", PI_PROFILE: "legacy" }, fixture.explicitAgentDir],
  ["OMP_PROFILE before legacy PI_PROFILE", { OMP_PROFILE: "work", PI_PROFILE: "legacy" }, fixture.workProfileAgentDir],
  ["legacy PI_PROFILE", { PI_PROFILE: "legacy" }, fixture.legacyProfileAgentDir],
  ["default OMP/XDG agent root", {}, fixture.defaultXdgAgentDir],
])("uses source-equivalent OMP root precedence for %s", async (_name, env, expectedAgentDir) => {
  const paths = await withProcessEnv({ ...fixture.ompEnv, ...env }, () => resolveAgentPaths());
  expect(paths.agentDir).toBe(expectedAgentDir);
});

it("writes dashboard metadata only after an explicit dashboard save", async () => {
  const paths = await withProcessEnv(fixture.ompEnv, () => resolveAgentPaths());
  const before = await snapshotTree(paths.sessionsDir);
  await saveSessionMeta(paths.agentDir, fixture.sessionId, { pinned: true });
  expect(await readJson(`${paths.dashboardDir}/${fixture.sessionId}.json`)).toMatchObject({ pinned: true });
  expect(await snapshotTree(paths.sessionsDir)).toEqual(before);
});
```

Use the real scanner and replay entry points on the same fixture, then repeat the exact absent-file assertion for `<agentDir>/dashboard/<sessionId>.json`; reading, scanning, and replaying must not call metadata save or create that path. `withProcessEnv` must restore the server process environment after every resolver case.

- [ ] **Step 2: Run focused session tests and confirm failure**

Run: `npm test -- packages/shared/src/__tests__/dashboard-paths.test.ts packages/shared/src/__tests__/config.test.ts packages/shared/src/__tests__/session-meta.test.ts packages/shared/src/__tests__/state-replay-entry-id.test.ts packages/shared/src/__tests__/state-replay-flow-events.test.ts packages/server/src/__tests__/session-scanner.test.ts packages/server/src/__tests__/session-scanner-resolve-dir.integration.test.ts packages/server/src/__tests__/session-load-worker.test.ts packages/server/src/__tests__/session-stats-reader.test.ts packages/server/src/__tests__/meta-persistence.test.ts packages/server/src/__tests__/omp-session-read-only.integration.test.ts`

Expected: FAIL because Pi paths, adjacent `.meta.json`, and Pi JSONL assumptions remain.

- [ ] **Step 3: Implement OMP-only roots, metadata, and projection**

```ts
export function resolveAgentPaths(env: NodeJS.ProcessEnv = process.env): AgentPaths {
  const agentDir = resolveOmp164AgentDir(env);
  return { agentDir, sessionsDir: path.join(agentDir, "sessions"), dashboardDir: path.join(agentDir, "dashboard"), blobsDir: path.join(agentDir, "blobs") };
}
```

```ts
export type OmpSessionProjection = {
  sessionId: string;
  titleSlot?: string;
  headerTitle?: string;
  titleSource?: string;
  entries: OmpEntry[];
  blobRefs: Map<string, Buffer>;
};
```

`resolveOmp164AgentDir` must reproduce OMP `16.4.1` source behavior exactly: use non-empty `PI_CODING_AGENT_DIR`; otherwise resolve the active `OMP_PROFILE` profile agent root, falling back to `PI_PROFILE` only when `OMP_PROFILE` is unset; otherwise use OMP's default XDG-aware agent root. Do not replace the final branch with `path.join(homeDir, ".omp", "agent")`, and do not expose this resolver through browser or WebSocket protocol.

Read optional fixed-width `256` byte title record before v3 header. Keep slot title separate and make it display-preferred. Preserve header `title` and `titleSource`, `model_change.model` string and optional role, `thinking_level_change.thinkingLevel`, tree entry ID-parent chains, source order, and `blob:sha256:<hash>` payload from `<agentDir>/blobs/<hash>`. Store dashboard metadata only as `<agentDir>/dashboard/<sessionId>.json` after an explicit dashboard metadata/preference save; `readOmpSession`, scanner, loader, and replay paths must never create it. Preserve unrelated fields during an explicit merge. Ensure scanner, loader, discovery, and stats paths perform no source write, and update callers so they do not select writable migration or list helpers.

- [ ] **Step 4: Run focused session tests and confirm pass**

Run: `npm test -- packages/shared/src/__tests__/dashboard-paths.test.ts packages/shared/src/__tests__/config.test.ts packages/shared/src/__tests__/session-meta.test.ts packages/shared/src/__tests__/state-replay-entry-id.test.ts packages/shared/src/__tests__/state-replay-flow-events.test.ts packages/server/src/__tests__/session-scanner.test.ts packages/server/src/__tests__/session-scanner-resolve-dir.integration.test.ts packages/server/src/__tests__/session-load-worker.test.ts packages/server/src/__tests__/session-stats-reader.test.ts packages/server/src/__tests__/meta-persistence.test.ts packages/server/src/__tests__/omp-session-read-only.integration.test.ts`

Expected: PASS; fixture projections agree and session directory bytes plus mtimes stay unchanged.

- [ ] **Step 5: Commit OMP persistence reader**

```bash
git add packages/shared/src/dashboard-paths.ts packages/shared/src/config.ts packages/shared/src/session-meta.ts packages/shared/src/state-replay.ts packages/shared/src/__fixtures__/omp-v16.4.1 packages/shared/src/__tests__/dashboard-paths.test.ts packages/shared/src/__tests__/config.test.ts packages/shared/src/__tests__/session-meta.test.ts packages/shared/src/__tests__/state-replay-entry-id.test.ts packages/shared/src/__tests__/state-replay-flow-events.test.ts packages/server/src/session-scanner.ts packages/server/src/session-discovery.ts packages/server/src/session-file-reader.ts packages/server/src/session-load-worker.ts packages/server/src/session-load-worker-pool.ts packages/server/src/session-stats-reader.ts packages/server/src/meta-persistence.ts packages/server/src/session-bootstrap.ts packages/server/src/directory-service.ts packages/server/src/__tests__/session-scanner.test.ts packages/server/src/__tests__/session-scanner-resolve-dir.integration.test.ts packages/server/src/__tests__/session-load-worker.test.ts packages/server/src/__tests__/session-stats-reader.test.ts packages/server/src/__tests__/meta-persistence.test.ts packages/server/src/__tests__/omp-session-read-only.integration.test.ts
git commit -m "feat: read omp sessions without source writes"
```

### Task 4: Define Narrow OMP WebSocket Contracts and Ordered Event Store

**Files:**
- Modify: `packages/shared/src/protocol.ts`, `browser-protocol.ts`, `types.ts`, `state-replay.ts`
- Modify: `packages/server/src/memory-session-manager.ts`, `memory-event-store.ts`, `browser-gateway.ts`, `event-wiring.ts`, `browser-handlers/subscription-handler.ts`
- Modify tests: `packages/shared/src/__tests__/protocol.test.ts`, `browser-protocol-types.test.ts`; `packages/server/src/__tests__/browser-gateway-snapshot-on-connect.test.ts`, `browser-gateway-dropped-frames.test.ts`, `subscription-handler.test.ts`, `event-wiring-process-classify.test.ts`
- Create: `packages/server/src/__tests__/core-subscription-replay.test.ts`

**Interfaces:**
- Consumes: `SessionRegisterMessage`, `EventForwardMessage`, `ReplayCompleteMessage`, browser `SubscribeMessage` with `lastSeqBySession`.
- Produces: `CoreExtensionMessage`, `CoreBrowserMessage`, `append(sessionId, event): StoredEvent`, `after(sessionId, seq): StoredEvent[]`.
- Produces: browser messages `sessions_snapshot`, `event`, `event_replay`, `replay_complete`, `slash_command_result`, `structured_error`.

- [ ] **Step 1: Write failing ordering and union tests**

```ts
it("commits before fanout and replays only sequence after acknowledgement", async () => {
  await wire.forward({ type: "event_forward", sessionId: "A", event: first });
  expect(store.after("A", 0)).toEqual([{ seq: 1, event: first }]);
  expect(browser.sent).toContainEqual({ type: "event", sessionId: "A", seq: 1, event: first });
  await subscribe({ type: "subscribe", sessionId: "A", lastSeq: 1 });
  expect(browser.sent.filter((m) => m.type === "event_replay")).toEqual([]);
});
```

- [ ] **Step 2: Run protocol and ordered replay tests and confirm failure**

Run: `npm test -- packages/shared/src/__tests__/protocol.test.ts packages/shared/src/__tests__/browser-protocol-types.test.ts packages/server/src/__tests__/browser-gateway-snapshot-on-connect.test.ts packages/server/src/__tests__/browser-gateway-dropped-frames.test.ts packages/server/src/__tests__/subscription-handler.test.ts packages/server/src/__tests__/event-wiring-process-classify.test.ts packages/server/src/__tests__/core-subscription-replay.test.ts`

Expected: FAIL because broad Pi-era messages and unordered/reconnect behavior remain.

- [ ] **Step 3: Implement core discriminated unions and store-before-fanout**

```ts
export type CoreExtensionMessage =
  | SessionRegisterMessage | SessionUnregisterMessage | SessionHeartbeatMessage
  | EventForwardMessage | ReplayCompleteMessage | DispatchExtensionCommandMessage;
export type CoreBrowserRequest = SubscribeMessage | UnsubscribeMessage | SendPromptMessage | AbortMessage | DispatchSlashCommandMessage | ProcessControlMessage | SetDisplayPrefsMessage | ReadFileMessage;

export function forward(sessionId: string, event: DashboardEvent): void {
  const stored = eventStore.append(sessionId, event);
  browserGateway.publish({ type: "event", sessionId, seq: stored.seq, event });
}
```

Keep only core protocol variants: exclude provider, model, catalogue, OpenSpec, flow, role, extension UI, terminal, editor, mutation, fork, resume, and spawn-by-arbitrary-command variants from the dashboard union without deleting upstream source. Preserve per-session monotonic counters. On subscribe, send snapshot, then only `seq > lastSeq` in ascending order, never live event before replay tail. Keep prompt request/response, built-in interactive prompt lifecycle, display preference update, owned process list update, and correlated headless slash result.

- [ ] **Step 4: Run protocol and ordered replay tests and confirm pass**

Run: `npm test -- packages/shared/src/__tests__/protocol.test.ts packages/shared/src/__tests__/browser-protocol-types.test.ts packages/server/src/__tests__/browser-gateway-snapshot-on-connect.test.ts packages/server/src/__tests__/browser-gateway-dropped-frames.test.ts packages/server/src/__tests__/subscription-handler.test.ts packages/server/src/__tests__/event-wiring-process-classify.test.ts packages/server/src/__tests__/core-subscription-replay.test.ts`

Expected: PASS; type tests reject excluded controls and replay preserves boundaries.

- [ ] **Step 5: Commit core transport contracts**

```bash
git add packages/shared/src/protocol.ts packages/shared/src/browser-protocol.ts packages/shared/src/types.ts packages/shared/src/state-replay.ts packages/shared/src/__tests__/protocol.test.ts packages/shared/src/__tests__/browser-protocol-types.test.ts packages/server/src/memory-session-manager.ts packages/server/src/memory-event-store.ts packages/server/src/browser-gateway.ts packages/server/src/event-wiring.ts packages/server/src/browser-handlers/subscription-handler.ts packages/server/src/__tests__/browser-gateway-snapshot-on-connect.test.ts packages/server/src/__tests__/browser-gateway-dropped-frames.test.ts packages/server/src/__tests__/subscription-handler.test.ts packages/server/src/__tests__/event-wiring-process-classify.test.ts packages/server/src/__tests__/core-subscription-replay.test.ts
git commit -m "feat: narrow omp dashboard websocket protocol"
```

### Task 5: Adapt Bridge to OMP 16.4.1 and Preserve Replay Ordering

**Files:**
- Modify: `packages/extension/src/bridge.ts`, `connection.ts`, `event-forwarder.ts`, `session-sync.ts`, `bridge-context.ts`, `slash-dispatch.ts`
- Modify tests: `packages/extension/src/__tests__/connection.test.ts`, `connection-dropped-frames.test.ts`, `session-sync.test.ts`, `session-switch.test.ts`, `event-forwarder.test.ts`, `bridge-retry-ordering.test.ts`, `bridge-abort-orderer.test.ts`

**Interfaces:**
- Consumes: OMP documented extension API, `CoreExtensionMessage`, `ConnectionManager`.
- Produces: `sendStateSync(ctx): Promise<void>`, `replaySessionEntries(ctx): Promise<void>`, `handleSessionChange(ctx, event): Promise<void>`.
- Produces: interactive bridge methods `sendPrompt(sessionId, text)`, `abort(sessionId)`.

- [ ] **Step 1: Write failing OMP lifecycle, order, and model tests**

```ts
it("registers then replays then flushes buffered event then completes", async () => {
  const replay = deferred<void>();
  await bridge.start({ sessionId: "A", replay });
  bridge.onOmpEvent(liveEntry);
  replay.resolve();
  await bridge.idle();
  expect(connection.sent.map((m) => m.type)).toEqual(["session_register", "event_forward", "event_forward", "replay_complete"]);
  expect(connection.sent[2]).toMatchObject({ event: liveEntry });
});

it("uses OMP model string without catalogue lookup", () => {
  expect(mapEventToProtocol({ type: "model_change", model: "provider/model" })).toMatchObject({ model: "provider/model" });
});
```

- [ ] **Step 2: Run bridge tests and confirm failure**

Run: `npm test -- packages/extension/src/__tests__/connection.test.ts packages/extension/src/__tests__/connection-dropped-frames.test.ts packages/extension/src/__tests__/session-sync.test.ts packages/extension/src/__tests__/session-switch.test.ts packages/extension/src/__tests__/event-forwarder.test.ts packages/extension/src/__tests__/bridge-retry-ordering.test.ts packages/extension/src/__tests__/bridge-abort-orderer.test.ts`

Expected: FAIL because Pi-era lifecycle events, mutable manager assumptions, and unsupported controls remain.

- [ ] **Step 3: Implement OMP bridge boundary**

```ts
await connection.send({ type: "session_register", sessionId, cwd, source: "interactive" });
for (const entry of persistedEntries) await connection.send({ type: "event_forward", sessionId, event: mapEventToProtocol(entry) });
for (const event of bufferedLiveEvents) await connection.send({ type: "event_forward", sessionId, event });
await connection.send({ type: "replay_complete", sessionId });
```

Use documented OMP `session_start`, `session_switch`, and `session_branch` events. Keep direct OMP `auto_retry` forwarding. Map `model_change.model` as opaque string; split only presentation fields at consumer boundary. Keep the core bridge free of `session_start.reason`, `session_before_fork`, `model_select`, `thinking_level_select`, `pi.dispatchCommand`, mutable `sessionManager` writes, provider/catalogue wiring, mDNS discovery, UI injection, flow/role tooling, and Pi-specific session mutations without deleting upstream sources. Require `session_register` before event forwarding after each WebSocket reconnect. Bridge may use documented Pi-era loader compatibility imports only at bridge boundary; throw clear load error when required compatibility export disappears.

- [ ] **Step 4: Run bridge tests and confirm pass**

Run: `npm test -- packages/extension/src/__tests__/connection.test.ts packages/extension/src/__tests__/connection-dropped-frames.test.ts packages/extension/src/__tests__/session-sync.test.ts packages/extension/src/__tests__/session-switch.test.ts packages/extension/src/__tests__/event-forwarder.test.ts packages/extension/src/__tests__/bridge-retry-ordering.test.ts packages/extension/src/__tests__/bridge-abort-orderer.test.ts`

Expected: PASS; bridge sends register/replay/live/complete order and routes prompt/abort by exact OMP session.

- [ ] **Step 5: Commit OMP bridge**

```bash
git add packages/extension/src/bridge.ts packages/extension/src/connection.ts packages/extension/src/event-forwarder.ts packages/extension/src/session-sync.ts packages/extension/src/bridge-context.ts packages/extension/src/slash-dispatch.ts packages/extension/src/__tests__/connection.test.ts packages/extension/src/__tests__/connection-dropped-frames.test.ts packages/extension/src/__tests__/session-sync.test.ts packages/extension/src/__tests__/session-switch.test.ts packages/extension/src/__tests__/event-forwarder.test.ts packages/extension/src/__tests__/bridge-retry-ordering.test.ts packages/extension/src/__tests__/bridge-abort-orderer.test.ts
git commit -m "feat: bridge omp sessions over loopback"
```

### Task 6: Expose Loopback Server Core Routes and Enforce Containment

**Files:**
- Modify: `packages/server/src/server.ts`, `pi-gateway.ts`, `browser-gateway.ts`, `browser-handlers/subscription-handler.ts`, `browser-handlers/session-action-handler.ts`, `file-routes.ts`, `preferences-display-routes.ts`, `session-routes.ts`, `session-api.ts`
- Modify tests: `packages/server/src/__tests__/pi-gateway-bind-host.test.ts`, `heartbeat-ack.test.ts`, `browser-gateway-snapshot-on-connect.test.ts`, `subscription-handler.test.ts`, `session-api.test.ts`
- Create: `packages/server/src/__tests__/core-file-routes.test.ts`, `core-preferences-routes.test.ts`, `core-session-action.test.ts`

**Interfaces:**
- Consumes: browser `send_prompt`, `abort`, `dispatch_slash_command`, `read_file`, display preference messages; bridge prompt/abort gateway.
- Produces: `routePrompt({ sessionId, text, requestId }): Promise<void>`, `routeAbort({ sessionId, requestId }): Promise<void>`, `routeSlashCommand({ sessionId, command, args, requestId }): Promise<CorrelatedRpcResult>`, `readSessionFile(sessionId, requestPath): Promise<FilePayload>`.
- Produces: HTTP `GET/PATCH /api/preferences/display`, `GET /api/file`, optional `GET /api/file/raw`, optional `GET /api/session/:id/tool-result`, `/ws`.

- [ ] **Step 1: Write failing loopback, file, preference, and action-isolation tests**

```ts
it("rejects path escapes and writes display preferences only under dashboard root", async () => {
  await expect(api.readFile({ sessionId: "A", path: "../secret" })).rejects.toMatchObject({ code: "PATH_OUTSIDE_SESSION_ROOT" });
  await expect(api.readFile({ sessionId: "A", path: outsideAbsolute })).rejects.toMatchObject({ code: "PATH_OUTSIDE_SESSION_ROOT" });
  await expect(api.readFile({ sessionId: "A", path: "escape-link" })).rejects.toMatchObject({ code: "PATH_OUTSIDE_SESSION_ROOT" });
  await api.patchDisplayPrefs({ showThinking: false });
  expect(await readJson(`${agentDir}/dashboard/preferences.json`)).toMatchObject({ displayPrefs: { showThinking: false } });
});

it("does not route session A control to session B", async () => {
  await expect(actions.prompt({ sessionId: "B", text: "x", requestId: "1" })).rejects.toMatchObject({ code: "SESSION_NOT_REGISTERED" });
  expect(piGateway.sent).not.toContainEqual(expect.objectContaining({ sessionId: "A", text: "x" }));
});
```

- [ ] **Step 2: Run core server route tests and confirm failure**

Run: `npm test -- packages/server/src/__tests__/pi-gateway-bind-host.test.ts packages/server/src/__tests__/heartbeat-ack.test.ts packages/server/src/__tests__/browser-gateway-snapshot-on-connect.test.ts packages/server/src/__tests__/subscription-handler.test.ts packages/server/src/__tests__/session-api.test.ts packages/server/src/__tests__/core-file-routes.test.ts packages/server/src/__tests__/core-preferences-routes.test.ts packages/server/src/__tests__/core-session-action.test.ts`

Expected: FAIL because wildcard/listener or broad routes, Pi paths, writable actions, and unscoped actions remain.

- [ ] **Step 3: Implement core-only routes and actions**

```ts
function resolveReadPath(root: string, requestPath: string): string {
  if (path.isAbsolute(requestPath)) throw structuredError("PATH_OUTSIDE_SESSION_ROOT");
  const resolved = realpathSync(path.resolve(root, requestPath));
  if (!resolved.startsWith(`${realpathSync(root)}${path.sep}`) && resolved !== realpathSync(root)) throw structuredError("PATH_OUTSIDE_SESSION_ROOT");
  return resolved;
}

await fastify.listen({ host: "127.0.0.1", port });
```

Route `send_prompt` and `abort` only through bridge by canonical session ID. Route `dispatch_slash_command` only to live keeper-owned session and await its correlated result; for interactive TUI session return `{ code: "SLASH_COMMAND_UNAVAILABLE", sessionId, requestId }` without forwarding a prompt or OMP command. Preserve request IDs in all success and structured error messages. Restrict `/api/file` and raw/tool-result endpoints to read-only selected-session roots. Merge display preference patches into `<agentDir>/dashboard/preferences.json`; preserve unrelated dashboard keys. Do not register provider/auth/catalogue/model-proxy, configuration, editor, terminal, browse, write/delete/rename/chmod/mkdir, fork, resume, or unscoped session APIs in the dashboard core. Reject unsupported operation with structured `UNSUPPORTED_OPERATION`.

- [ ] **Step 4: Run core server route tests and confirm pass**

Run: `npm test -- packages/server/src/__tests__/pi-gateway-bind-host.test.ts packages/server/src/__tests__/heartbeat-ack.test.ts packages/server/src/__tests__/browser-gateway-snapshot-on-connect.test.ts packages/server/src/__tests__/subscription-handler.test.ts packages/server/src/__tests__/session-api.test.ts packages/server/src/__tests__/core-file-routes.test.ts packages/server/src/__tests__/core-preferences-routes.test.ts packages/server/src/__tests__/core-session-action.test.ts`

Expected: PASS; server listens loopback, routes only supported controls, contains paths after symlink resolution, and writes only dashboard preferences.

- [ ] **Step 5: Commit server core routes**

```bash
git add packages/server/src/server.ts packages/server/src/pi-gateway.ts packages/server/src/browser-gateway.ts packages/server/src/browser-handlers/subscription-handler.ts packages/server/src/browser-handlers/session-action-handler.ts packages/server/src/file-routes.ts packages/server/src/preferences-display-routes.ts packages/server/src/session-routes.ts packages/server/src/session-api.ts packages/server/src/__tests__/pi-gateway-bind-host.test.ts packages/server/src/__tests__/heartbeat-ack.test.ts packages/server/src/__tests__/browser-gateway-snapshot-on-connect.test.ts packages/server/src/__tests__/subscription-handler.test.ts packages/server/src/__tests__/session-api.test.ts packages/server/src/__tests__/core-file-routes.test.ts packages/server/src/__tests__/core-preferences-routes.test.ts packages/server/src/__tests__/core-session-action.test.ts
git commit -m "feat: serve contained omp dashboard core"
```

### Task 7: Run Headless OMP RPC Keeper and Owned Process Control

**Files:**
- Modify: `packages/server/src/process-manager.ts`, `headless-pid-registry.ts`, `rpc-keeper/keeper-manager.ts`, `rpc-keeper/keeper.cjs`, `rpc-keeper/dispatch-router.ts`, `browser-handlers/session-action-handler.ts`
- Modify tests: `packages/server/src/__tests__/process-manager-keeper-spawn.test.ts`, `headless-pid-registry.test.ts`, `headless-pid-registry-kill-escalation.test.ts`, `keeper-manager.test.ts`, `dispatch-extension-command-router.test.ts`, `session-kill-e2e.test.ts`, `rpc-keeper/__tests__/keeper-shutdown-kills-pi.test.ts`
- Create: `packages/server/src/rpc-keeper/__tests__/omp-jsonl-stdout.test.ts`, `headless-slash-isolation.test.ts`

**Interfaces:**
- Consumes: `omp --mode rpc`, `sessionId`, `requestId`, keeper ownership record.
- Produces: `KeeperManager.start(sessionId): Promise<Keeper>`, `Keeper.request(request: { type: "prompt"; message: string; id: string }): Promise<RpcResponse>`, `Keeper.dispatchSlashCommand(sessionId, command, args, requestId): Promise<CorrelatedRpcResult>`; dispatch resolves only from a parsed child response or prompt result correlated by `requestId`, never from `stdin.write` success.
- Produces: `OwnedProcessHandle { handle: string; sessionId: string; pid: number; cwd: string }`.

- [ ] **Step 1: Write failing JSONL, correlation, and ownership tests**

```ts
it("sends documented OMP prompt JSONL and waits for correlated result", async () => {
  const result = keeper.dispatchSlashCommand("headless-A", "/status", {}, "r-1");
  expect(fakeOmp.stdinJson).toContainEqual({ type: "prompt", message: "/status", id: "r-1" });
  expect(await settles(result)).toBe(false); // transport acceptance is not command completion
  fakeOmp.emitCorrelatedResponse({ id: "r-1" });
  await expect(result).resolves.toMatchObject({ id: "r-1" });
  expect(fakeOmp.stdoutLines.every((line) => { JSON.parse(line); return true; })).toBe(true);
  expect(fakeOmp.stderr).toContain("keeper diagnostic");
});

it("rejects raw PID and cross-session process handle", async () => {
  await expect(control.kill({ sessionId: "A", pid: 12 })).rejects.toMatchObject({ code: "RAW_PID_FORBIDDEN" });
  await expect(control.kill({ sessionId: "A", handle: processForB.handle })).rejects.toMatchObject({ code: "PROCESS_OWNERSHIP_MISMATCH" });
});
```

- [ ] **Step 2: Run keeper and process tests and confirm failure**

Run: `npm test -- packages/server/src/__tests__/process-manager-keeper-spawn.test.ts packages/server/src/__tests__/headless-pid-registry.test.ts packages/server/src/__tests__/headless-pid-registry-kill-escalation.test.ts packages/server/src/__tests__/keeper-manager.test.ts packages/server/src/__tests__/dispatch-extension-command-router.test.ts packages/server/src/__tests__/session-kill-e2e.test.ts packages/server/src/rpc-keeper/__tests__/keeper-shutdown-kills-pi.test.ts packages/server/src/rpc-keeper/__tests__/omp-jsonl-stdout.test.ts packages/server/src/rpc-keeper/__tests__/headless-slash-isolation.test.ts`

Expected: FAIL because keeper accepts a Pi/invented RPC envelope, settles command dispatch on transport write instead of child correlation, or permits unowned process control.

- [ ] **Step 3: Implement OMP RPC and ownership gates**

```ts
const request = { type: "prompt", message: command, id: requestId };
const deferred = createDeferred<CorrelatedRpcResult>();
pending.set(request.id, deferred);
child.stdin.write(`${JSON.stringify(request)}\n`);
return deferred.promise;
```

```ts
function assertOwner(requestSessionId: string, owned: OwnedProcessHandle): void {
  if (requestSessionId !== owned.sessionId) throw structuredError("PROCESS_OWNERSHIP_MISMATCH");
}
```

Parse every child stdout line as JSON before routing response or event. Resolve or reject and clear the pending entry only when a parsed child response or prompt result carries the matching `id`; treat `stdin.write` only as transport acceptance, never RPC success. Send all keeper and bridge diagnostics to child `stderr` path or server logger; never `console.log` from bridge code that OMP loads in RPC child. Keep child event stream distinct from bridge agent event stream to prevent duplicate transcript events. Register process ownership before expose handle. Permit `kill` and `forceKill` only by handle plus same session. Do not expose raw PID, arbitrary command, terminal, or system process action.

- [ ] **Step 4: Run keeper and process tests and confirm pass**

Run: `npm test -- packages/server/src/__tests__/process-manager-keeper-spawn.test.ts packages/server/src/__tests__/headless-pid-registry.test.ts packages/server/src/__tests__/headless-pid-registry-kill-escalation.test.ts packages/server/src/__tests__/keeper-manager.test.ts packages/server/src/__tests__/dispatch-extension-command-router.test.ts packages/server/src/__tests__/session-kill-e2e.test.ts packages/server/src/rpc-keeper/__tests__/keeper-shutdown-kills-pi.test.ts packages/server/src/rpc-keeper/__tests__/omp-jsonl-stdout.test.ts packages/server/src/rpc-keeper/__tests__/headless-slash-isolation.test.ts`

Expected: PASS; every child stdout line parses JSON, response IDs correlate, and only owning session controls registered process.

- [ ] **Step 5: Commit OMP RPC keeper**

```bash
git add packages/server/src/process-manager.ts packages/server/src/headless-pid-registry.ts packages/server/src/rpc-keeper/keeper-manager.ts packages/server/src/rpc-keeper/keeper.cjs packages/server/src/rpc-keeper/dispatch-router.ts packages/server/src/browser-handlers/session-action-handler.ts packages/server/src/__tests__/process-manager-keeper-spawn.test.ts packages/server/src/__tests__/headless-pid-registry.test.ts packages/server/src/__tests__/headless-pid-registry-kill-escalation.test.ts packages/server/src/__tests__/keeper-manager.test.ts packages/server/src/__tests__/dispatch-extension-command-router.test.ts packages/server/src/__tests__/session-kill-e2e.test.ts packages/server/src/rpc-keeper/__tests__/keeper-shutdown-kills-pi.test.ts packages/server/src/rpc-keeper/__tests__/omp-jsonl-stdout.test.ts packages/server/src/rpc-keeper/__tests__/headless-slash-isolation.test.ts
git commit -m "feat: control headless omp rpc sessions"
```

### Task 8: Replace Browser With Core OMP Composition

**Files:**
- Modify: `packages/client/src/main.tsx`, `App.tsx`, `hooks/useWebSocket.ts`, `hooks/useMessageHandler.ts`, `hooks/useSessionActions.ts`, `event-reducer.ts`
- Modify: `packages/client/src/components/ChatView.tsx`, `ToolCallStep.tsx`, `CommandInput.tsx`, `ProcessList.tsx`, `FilePreviewOverlay.tsx`, `interactive-renderers/registry.tsx`, `contexts/FilePreviewContext.tsx`, `contexts/DisplayPrefsContext.tsx`, `hooks/useViewDispatcher.ts`, `hooks/useDisplayPrefs.ts`, `components/FirstLaunchDisplayModal.tsx`, `encodePromptAnswer.ts`
- Create: `packages/client/src/components/CoreSessionList.tsx`, `CoreTranscript.tsx`, `CoreComposer.tsx`, `CoreProcessDrawer.tsx`
- Create tests: `packages/client/src/__tests__/CoreApp.session-view.test.tsx`, `CoreApp.live-replay.test.tsx`, `CoreApp.prompts.test.tsx`, `CoreApp.abort-and-process.test.tsx`, `CoreApp.display-prefs.test.tsx`
- Modify tests: `packages/client/src/hooks/__tests__/useViewDispatcher.test.ts`, `useDisplayPrefs.test.tsx`, `useSessionActions.optimistic-prompt.test.tsx`; `packages/client/src/__tests__/use-message-handler-pending-prompt.test.ts`, `state-replay.test.ts`; `packages/client/src/components/__tests__/ProcessList.test.tsx`, `CommandInput.test.tsx`, `FilePreviewOverlay.test.tsx`

**Interfaces:**
- Consumes: `CoreBrowserMessage`, `CoreBrowserRequest`, selected `sessionId`, REST display/file endpoints.
- Produces: routes `"/"` and `"/session/:id"`; `useCoreWebSocket(): CoreSocketState`; `useSessionActions(sessionId): { sendPrompt, abort, dispatchSlashCommand(command, args): Promise<CorrelatedRpcResult>, killProcess, forceKillProcess, respondToUi }`.
- Produces: optimistic prompt state, ordered replay reducer, display preferences, read-only preview state.

- [ ] **Step 1: Write failing core app behavior tests**

```tsx
it("renders only core session route and applies ordered replay", async () => {
  render(<CoreApp socket={socket} />);
  socket.message({ type: "sessions_snapshot", sessions: [sessionA] });
  await userEvent.click(screen.getByRole("link", { name: sessionA.title }));
  socket.message({ type: "event_replay", sessionId: "A", events: [{ seq: 1, event: userEntry }], isLast: true });
  expect(await screen.findByText(userEntry.content)).toBeVisible();
  expect(screen.queryByText(/OpenSpec|Worktree|Terminal|Model catalog/i)).toBeNull();
});

it("routes an interactive slash command through dispatch and renders unavailable", async () => {
  await userEvent.type(screen.getByRole("textbox"), "/status");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  const request = socket.sent.find((message) => message.type === "dispatch_slash_command");
  expect(request).toMatchObject({ type: "dispatch_slash_command", sessionId: sessionA.id, command: "/status" });
  expect(socket.sent).not.toContainEqual(expect.objectContaining({ type: "send_prompt", text: "/status" }));
  socket.message({ type: "structured_error", code: "SLASH_COMMAND_UNAVAILABLE", sessionId: sessionA.id, requestId: request.requestId });
  expect(await screen.findByText("SLASH_COMMAND_UNAVAILABLE")).toBeVisible();
});

it("awaits the correlated keeper result for a headless slash command", async () => {
  const result = actions.dispatchSlashCommand("/status", {});
  const request = socket.sent.find((message) => message.type === "dispatch_slash_command");
  socket.message({ type: "slash_command_result", sessionId: headlessSession.id, requestId: request.requestId, result: { id: request.requestId } });
  await expect(result).resolves.toMatchObject({ id: request.requestId });
});
```

- [ ] **Step 2: Run core client tests and confirm failure**

Run: `npm test -- packages/client/src/hooks/__tests__/useViewDispatcher.test.ts packages/client/src/hooks/__tests__/useDisplayPrefs.test.tsx packages/client/src/hooks/__tests__/useSessionActions.optimistic-prompt.test.tsx packages/client/src/__tests__/use-message-handler-pending-prompt.test.ts packages/client/src/__tests__/state-replay.test.ts packages/client/src/components/__tests__/ProcessList.test.tsx packages/client/src/components/__tests__/CommandInput.test.tsx packages/client/src/components/__tests__/FilePreviewOverlay.test.tsx packages/client/src/__tests__/CoreApp.session-view.test.tsx packages/client/src/__tests__/CoreApp.live-replay.test.tsx packages/client/src/__tests__/CoreApp.prompts.test.tsx packages/client/src/__tests__/CoreApp.abort-and-process.test.tsx packages/client/src/__tests__/CoreApp.display-prefs.test.tsx`

Expected: FAIL because old app imports plugin runtime and exposes excluded views/actions.

- [ ] **Step 3: Implement only core browser state and composition**

```tsx
<Router>
  <Route path="/" component={CoreSessionList} />
  <Route path="/session/:id">{({ id }) => <CoreSessionView sessionId={id} />}</Route>
</Router>
```

```ts
const CORE_MESSAGE_TYPES = new Set([
  "sessions_snapshot", "session_added", "session_updated", "session_state_reset",
  "event", "event_replay", "prompt_received", "prompt_request", "prompt_dismiss",
  "prompt_cancel", "process_list_update", "display_prefs_updated", "slash_command_result", "structured_error",
]);
```

Create composition around session list, transcript, composer, built-in interactive prompt renderers, display preference modal, owned process drawer, and read-only file overlay. Keep protocol snapshot/reset and optimistic prompt acknowledgement behavior. Render slot title, header title, model string, and resolved blob result. Route prompt and abort with selected canonical ID. Detect slash commands before prompt dispatch: always send typed `/status` as `dispatch_slash_command`, never `send_prompt`; for an interactive TUI session render correlated `SLASH_COMMAND_UNAVAILABLE` with no retry, and for a live keeper-backed headless session await the correlated `slash_command_result`. Keep no excluded plugin registry/runtime or route/control in the dashboard core. Do not parse OMP files or call provider APIs in browser.

- [ ] **Step 4: Run core client tests and confirm pass**

Run: `npm test -- packages/client/src/hooks/__tests__/useViewDispatcher.test.ts packages/client/src/hooks/__tests__/useDisplayPrefs.test.tsx packages/client/src/hooks/__tests__/useSessionActions.optimistic-prompt.test.tsx packages/client/src/__tests__/use-message-handler-pending-prompt.test.ts packages/client/src/__tests__/state-replay.test.ts packages/client/src/components/__tests__/ProcessList.test.tsx packages/client/src/components/__tests__/CommandInput.test.tsx packages/client/src/components/__tests__/FilePreviewOverlay.test.tsx packages/client/src/__tests__/CoreApp.session-view.test.tsx packages/client/src/__tests__/CoreApp.live-replay.test.tsx packages/client/src/__tests__/CoreApp.prompts.test.tsx packages/client/src/__tests__/CoreApp.abort-and-process.test.tsx packages/client/src/__tests__/CoreApp.display-prefs.test.tsx`

Expected: PASS; browser handles core snapshot/replay/control/preferences/preview flows and renders no excluded surface.

- [ ] **Step 5: Commit browser core**

```bash
git add packages/client/src/main.tsx packages/client/src/App.tsx packages/client/src/hooks/useWebSocket.ts packages/client/src/hooks/useMessageHandler.ts packages/client/src/hooks/useSessionActions.ts packages/client/src/event-reducer.ts packages/client/src/components/ChatView.tsx packages/client/src/components/ToolCallStep.tsx packages/client/src/components/CommandInput.tsx packages/client/src/components/ProcessList.tsx packages/client/src/components/FilePreviewOverlay.tsx packages/client/src/components/interactive-renderers/registry.tsx packages/client/src/components/CoreSessionList.tsx packages/client/src/components/CoreTranscript.tsx packages/client/src/components/CoreComposer.tsx packages/client/src/components/CoreProcessDrawer.tsx packages/client/src/contexts/FilePreviewContext.tsx packages/client/src/contexts/DisplayPrefsContext.tsx packages/client/src/hooks/useViewDispatcher.ts packages/client/src/hooks/useDisplayPrefs.ts packages/client/src/components/FirstLaunchDisplayModal.tsx packages/client/src/encodePromptAnswer.ts packages/client/src/hooks/__tests__ packages/client/src/__tests__ packages/client/src/components/__tests__
git commit -m "feat: render core omp dashboard browser"
```

### Task 9: Package Through OMP Plugin Manager and Gate Release

**Files:**
- Modify: `scripts/test-standalone-npm-install.sh`, `scripts/test-standalone-npm-install.ps1`
- Create: `scripts/test-omp-plugin-manager.sh`, `scripts/__tests__/omp-plugin-manager.test.mjs`
- Create: `tests/e2e/omp-plugin-install-link.spec.ts`
- Modify: `.github/workflows/ci.yml`, `.github/workflows/_smoke.yml`, `.github/workflows/ci-smoke.yml`, `.github/workflows/publish.yml`
- Retain upstream Electron source, tests, configs, workflows, and release helpers for rebase parity. The root package, modified root CI/publish workflows, and release artifacts must omit Electron build, publish, and release execution.

**Interfaces:**
- Consumes: `npm pack`, OMP `16.4.1` binary, Node `22`, root tarball, OMP plugin-manager install/link commands.
- Produces: release gate `scripts/test-omp-plugin-manager.sh` exit `0` only after install and link smoke pass.
- Produces: CI artifacts restricted to one root tarball plus `dist/**`.

- [ ] **Step 1: Write failing install/link release test**

```js
test("OMP plugin manager install and link leave settings untouched", async () => {
  const before = await snapshotSettings(tempHome);
  await installThroughOmpPluginManager(tarball);
  await startOmp164Session();
  await assertRegisteredSession();
  await linkThroughOmpPluginManager(repoRoot);
  await startOmp164Session();
  await assertRegisteredSession();
  assert.deepEqual(await snapshotSettings(tempHome), before);
});
```

- [ ] **Step 2: Run release smoke and confirm failure**

Run: `npm run build && node --test scripts/__tests__/omp-plugin-manager.test.mjs && bash scripts/test-omp-plugin-manager.sh`

Expected: FAIL because existing smoke packs or installs workspace packages, expects Pi registration, or expects Electron output.

- [ ] **Step 3: Implement root-only smoke and CI gates**

```sh
npm pack --pack-destination "$TMPDIR"
HOME="$TMPDIR/home" omp plugin install "$TGZ"
test "$(HOME="$TMPDIR/home" omp --version)" = "16.4.1"
HOME="$TMPDIR/home" omp plugin link "$PWD"
```

Make both shell and PowerShell smoke scripts create a fresh home, snapshot Pi/OMP registration settings before action, install root tarball through OMP plugin manager, start OMP `16.4.1`, assert `dist/extension/index.mjs` loads, assert package-local Node server returns loopback health and browser receives register, then link local candidate and repeat. Assert settings snapshots equal before state. Assert tarball excludes Electron and BlackBelt runtime imports. Set root release gates to `npm run build`, `npm run verify:omp-dist`, focused tests, root tarball smoke, and install/link E2E; do not invoke workspace publication/version synchronization or Electron packaging/release jobs. Publish only root tarball.

- [ ] **Step 4: Run release gates and confirm pass**

Run: `npm run build && npm run verify:omp-dist && node --test scripts/__tests__/omp-dist-contract.test.mjs scripts/__tests__/omp-plugin-manager.test.mjs && bash scripts/test-standalone-npm-install.sh && bash scripts/test-omp-plugin-manager.sh`

Expected: PASS; root tarball installs and links through OMP only, no registration setting changes, no Electron requirement, and browser observes registered session.

- [ ] **Step 5: Commit release gates**

```bash
git add package-lock.json scripts/test-standalone-npm-install.sh scripts/test-standalone-npm-install.ps1 scripts/test-omp-plugin-manager.sh scripts/__tests__/omp-plugin-manager.test.mjs tests/e2e/omp-plugin-install-link.spec.ts .github/workflows/ci.yml .github/workflows/_smoke.yml .github/workflows/ci-smoke.yml .github/workflows/publish.yml
git commit -m "ci: gate omp dashboard package release"
```

## Release Gates

- [ ] Run `npm run build` under Node `22`.
- [ ] Run `npm run verify:omp-dist`.
- [ ] Run focused shared, extension, server, keeper, client, and artifact tests from Tasks 1–8.
- [ ] Confirm `npm pack --json` lists `dist/extension/index.mjs`, `dist/server/cli.mjs`, `dist/web/index.html`, browser assets, and no raw `packages/**` runtime source.
- [ ] Confirm `dist/extension/index.mjs` and `dist/server/cli.mjs` contain no `@blackbelt-technology/` import string.
- [ ] Confirm all files emitted under `dist/web/assets` that meet precompress threshold have `.gz` sibling.
- [ ] Run root tarball smoke on POSIX and PowerShell.
- [ ] Run fresh OMP `16.4.1` plugin-manager install smoke.
- [ ] Run fresh OMP `16.4.1` plugin-manager link smoke.
- [ ] Confirm both smoke homes preserve Pi and OMP registration settings byte-for-byte.
- [ ] Confirm `GET /api/health`, static `/`, `/ws`, prompt, abort, ordered replay/reconnect, headless slash command, process ownership, display preferences, and contained read-only file preview work end-to-end.
- [ ] Confirm interactive TUI slash command returns `SLASH_COMMAND_UNAVAILABLE` and dispatches no OMP command.
- [ ] Confirm malformed RPC request and handled keeper error leave every OMP child stdout line parseable JSON and send diagnostics to stderr.
- [ ] Confirm `readOmpSession`, scanner, loader, and replay leave fixture session bytes and mtimes unchanged and do not create `<agentDir>/dashboard/<sessionId>.json`; confirm an explicit dashboard metadata/preference save creates dashboard state only under `<agentDir>/dashboard`.
- [ ] Confirm browser has only `/` and `/session/:id`, with no excluded controls or routes.
