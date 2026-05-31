## 1. Workspace scaffold

- [x] 1.1 Create `packages/image-fit-extension/` directory with `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/`, `src/__tests__/`
- [x] 1.2 Author `package.json`: name `@blackbelt-technology/pi-image-fit`, version locked to current monorepo version, `type: "module"`, `publishConfig.access: public`, `repository.directory`, `files: ["src/"]`
- [x] 1.3 Declare `pi.extensions: ["src/extension.ts"]` in `package.json`
- [x] 1.4 Add optional peer deps `@earendil-works/pi-coding-agent` + `@mariozechner/pi-coding-agent` with `peerDependenciesMeta.optional: true` (mirror `packages/extension/package.json`)
- [x] 1.5 Add `jimp` to `dependencies`. Confirm `npm ls --workspace=@blackbelt-technology/pi-image-fit` shows no `sharp` / `@napi-rs/image` / native-binary deps in the tree
- [x] 1.6 Add `@earendil-works/pi-coding-agent` to `devDependencies` for type imports + tests
- [x] 1.7 Run `npm install` at repo root; verify the new workspace is linked and `package-lock.json` updates cleanly

## 2. Core hook implementation

- [x] 2.1 Create `src/policy.ts`: `readConfigFromEnv()` returns `{ disabled, maxEdge, maxBytes, quality }` with documented defaults (1568 / 4194304 / 85); emit single warning line on invalid values; return defaults on parse failure (spec: Environment-variable configuration)
- [x] 2.2 Create `src/cache.ts`: `sessionCacheDir(sessionId|pid)`, `cacheKey({absPath, mtime, maxEdge, maxBytes, quality})` → SHA-256 hex, `cleanupSession(dir)`, `cleanupOrphans()` (24h sweep on load). All fs ops async, errors swallowed-and-logged (spec: Temp-file cache)
- [x] 2.3 Create `src/resize.ts`: `needsResize({bytes, maxBytes, dims, maxEdge})` predicate; `resizeToWebp(srcPath, dstPath, {maxEdge, quality})` using jimp — long-edge scaling preserves aspect ratio for both landscape and portrait (spec: Resize implementation)
- [x] 2.4 Create `src/extension.ts`: register `pi.on("tool_call", ...)`, gate on `toolName === "read"` and image extension allowlist, run policy → probe → resize → mutate `event.input.path`, all wrapped in try/catch with fall-through (spec: Tool-call mutation seam, Resize threshold policy, Defensive fall-through on failure)
- [x] 2.5 Wire `session_shutdown` handler to call `cleanupSession()` for this session's cache dir (spec: Temp-file cache)
- [x] 2.6 On extension load: if `PI_IMAGE_FIT_DISABLE` truthy, log disabled message and skip registration entirely (spec: Default-on behavior, Environment-variable configuration)
- [x] 2.7 On extension load: fire-and-forget `cleanupOrphans()` (24h sweep, errors swallowed)
- [x] 2.8 Emit resize telemetry line exactly once per successful resize in the spec'd format; no log on pass-through (spec: Resize telemetry)

## 3. Tests

- [x] 3.1 `__tests__/policy.test.ts`: env-var parsing (defaults, overrides, invalid values fall back with single warning, all four vars covered)
- [x] 3.2 `__tests__/cache.test.ts`: cache-key stability for identical inputs, cache-key changes on mtime / maxEdge / maxBytes / quality, session cleanup removes dir, orphan sweep removes >24h dirs and leaves <24h dirs
- [x] 3.3 `__tests__/resize.test.ts`: landscape 4032×3024 → 1568×1176 (±1 px), portrait 3024×4032 → 1176×1568 (±1 px), output is webp, already-small input is detected by `needsResize` returning false in all four corner cases (≤edge/≤bytes, ≤edge/>bytes, >edge/≤bytes, >edge/>bytes)
- [x] 3.4 `__tests__/extension.test.ts` with a fake `ExtensionAPI` (capture handler via `pi.on = vi.fn(...)`, mirror pattern from `packages/extension/src/__tests__/provider-register-reload.test.ts`):
  - non-read tool call: handler returns without I/O (assert no fs.stat call)
  - non-image read: handler returns without I/O
  - already-small image: handler returns without mutating `event.input.path`
  - oversize image: handler mutates `event.input.path` to a webp temp file and that file exists on disk
  - cache hit: second call with same source returns same temp path with no re-encode (jimp invocation count == 1)
  - jimp decode failure: `event.input.path` unchanged, one warning logged, no throw
  - ENOENT source: `event.input.path` unchanged, one warning logged
  - temp write failure: `event.input.path` reverted to original, one warning logged
- [x] 3.5 Telemetry shape test: capture `console.log` calls during a resize; assert exactly one line matching the documented format
- [x] 3.6 Disable kill-switch test: with `PI_IMAGE_FIT_DISABLE=1`, asserting `pi.on` is never called for `"tool_call"`
- [x] 3.7 Run `npm test --workspace=@blackbelt-technology/pi-image-fit` — all green

## 4. Skill + README

- [x] 4.1 Author `packages/image-fit-extension/README.md`: install, env vars, default thresholds, telemetry format, silent-quality-loss caveat, link back to monorepo
- [x] 4.2 Decide file-index placement (own split `docs/file-index-image-fit.md` vs. fold into `docs/file-index-extension.md`) and capture rationale in commit message. Default per design.md open question #1: fold into extension split
- [x] 4.3 Add row(s) to chosen `docs/file-index-*.md` split file in path-alphabetical order, caveman style (delegate to subagent per AGENTS.md Documentation Update Protocol)
- [x] 4.4 Update `docs/file-index.md` splits table only if a new split file was created

## 5. Monorepo doc + skill updates

- [x] 5.1 AGENTS.md: update "5 packages" reference near release flow → "6 packages" (delegate write to subagent with caveman-style instruction per AGENTS.md Documentation Update Protocol)
- [x] 5.2 `.pi/skills/release-cut/SKILL.md`: description "5 npm packages" → "6 npm packages"
- [x] 5.3 `.pi/skills/ci-troubleshoot/SKILL.md`: description "5 npm packages" → "6 npm packages"
- [x] 5.4 `grep -rn '5 packages\|5 npm packages' AGENTS.md docs/ .pi/skills/` — confirm no remaining hits referring to workspace package count

## 6. Build + integration verification

- [x] 6.1 From repo root: `npm run build` — succeeds without touching the new package (it ships TS sources directly per `files: ["src/"]`)
- [ ] 6.2 Manual end-to-end: in a scratch pi session with the new package linked, Read a known-oversize image (e.g. a 5 MB PNG); confirm telemetry line, confirm temp `.webp` exists under `os.tmpdir()/pi-image-fit/`, confirm pi's Read attaches the smaller image
- [ ] 6.3 Manual: with `PI_IMAGE_FIT_DISABLE=1`, repeat 6.2 and confirm no telemetry, no temp file, original image bytes attached
- [ ] 6.4 Manual: Read a small (<100 KB) image; confirm no telemetry, no temp file, no `event.input.path` mutation
- [ ] 6.5 Manual: Read the same oversize image twice in one session; confirm second read hits the cache (no second jimp invocation; same temp path) — use the resize telemetry line count as the observable
- [ ] 6.6 Test in dashboard context: install the new package, start dashboard server (`pi-dashboard start`), spawn a pi session, Read an oversize image, confirm the bridge forwards the (mutated) tool_call/tool_result events to the dashboard normally and the dashboard renders the resized image preview

## 7. QA matrix coverage

- [ ] 7.1 Add a `qa/tests/` case that installs the new package, runs a pi session that Reads an oversize image fixture (commit a ~5 MB PNG fixture under `qa/fixtures/`), and asserts the telemetry line + temp-file presence
- [ ] 7.2 Run `make test-linux-x86` from `qa/` — passes
- [ ] 7.3 Optional but recommended: run macOS + Windows QA matrix targets if available locally; otherwise rely on CI to catch platform issues

## 8. Release readiness

- [x] 8.1 Confirm `publish.yml` picks up the new workspace by inspecting the per-workspace publish loop on a `--dry-run` (or by reading the workflow and confirming no hardcoded package list)
- [x] 8.2 Run `openspec validate --changes pi-image-fit-extension` — passes
- [ ] 8.3 PR description references the change name `pi-image-fit-extension` so the `openspec-archive-change` skill can wire up cleanly after merge
- [ ] 8.4 Hand off to `release-cut` skill for next version bump cycle (no separate release for this package — lockstep with monorepo)
