# Plan — Remove `pi (core agent — legacy fork)` from Pi Ecosystem

**Status:** Proposed. No code changes yet.

## 1. What the screenshot row actually is

Settings → Packages → **Pi Ecosystem → CORE** row labelled **`pi (core agent — legacy fork)`** (`@mariozechner/pi-coding-agent`, 0.73.1 → 0.74.0, badge **local**).

Mapping in the codebase:

| UI field | Source |
|---|---|
| Display name `"pi (core agent — legacy fork)"` | `packages/server/src/pi-core-checker.ts:48` (`DISPLAY_NAME_OVERRIDES["@mariozechner/pi-coding-agent"]`) |
| Package id `@mariozechner/pi-coding-agent` | Same file, `PI_CORE_PACKAGES` list (line ~36) |
| Badge `local` | `UnifiedPackagesSection.tsx:348` — `installSource === "managed"` renders as `local` |
| Detection / cleanup helpers | `packages/server/src/legacy-pi-cleanup.ts` (`detectLegacyPiInstalls`, `uninstallLegacyPi`) |
| FAQ | `docs/faq.md:1818` — "Why do I see 'Legacy @mariozechner/pi-coding-agent detected'" |
| Architecture | `docs/architecture.md:514` |

Pi was renamed `@mariozechner/pi-coding-agent` → `@earendil-works/pi-coding-agent` at v0.74. Old scope publishes only up to 0.73.x; new scope's `bin/pi` symlink collides with the legacy install on `npm install -g` (EEXIST). The dashboard surfaces the legacy install **so the user can uninstall it**.

`installSource: "managed"` on this row ⇒ legacy fork lives at:

```
~/.pi-dashboard/node_modules/@mariozechner/pi-coding-agent
```

## 2. Two possible meanings of "remove"

| Meaning | Scope | Recommended? |
|---|---|---|
| **A. Uninstall the legacy fork from this machine** (make the row disappear) | Runtime cleanup, zero code change | ✅ This is almost certainly what the directive means |
| **B. Remove dashboard support for detecting/displaying the legacy fork at all** | Code change across server, shared, extension, tests, docs | ⚠️ Premature — until 0.73.x users have migrated, removing detection regresses the migration UX |

Default: do **A** now. Track **B** as a follow-up (separate proposal once telemetry / time shows the legacy fork is gone in the wild).

---

## 3. Plan A — Uninstall the legacy fork (recommended)

### A.1 Preconditions

- `~/.pi-dashboard/node_modules/@mariozechner/pi-coding-agent` exists (badge says `local` = managed dir).
- Dashboard server is up (so we can verify the row disappears after).

### A.2 Steps

1. **Stop the dashboard server** (avoid races with `bridge.ts`'s dynamic import of pi):
   ```
   pi-dashboard stop
   ```

2. **Remove the managed install**:
   ```
   rm -rf ~/.pi-dashboard/node_modules/@mariozechner/pi-coding-agent
   ```
   (Equivalent to `uninstallLegacyPi` in `packages/server/src/legacy-pi-cleanup.ts:128` for the `managed` scope.)

3. **Sweep the other two scopes too** (cheap, idempotent — covers a stale npm-global / npx-cache leak that the FAQ documents):
   ```
   npm uninstall -g @mariozechner/pi-coding-agent --no-fund --no-audit || true
   rm -rf ~/.npm/_npx/*/node_modules/@mariozechner/pi-coding-agent
   ```

4. **Restart the dashboard**:
   ```
   pi-dashboard start
   ```

5. **Verify in UI**: Settings → Packages → Pi Ecosystem → CORE should now show only:
   - `pi (core agent)` — `@earendil-works/pi-coding-agent` 0.74.0 (green check)
   - `pi-model-proxy` — `@blackbelt-technology/pi-model-proxy`

   The `pi (core agent — legacy fork)` row is gone (because `detectLegacyPiInstalls()` now returns `[]`).

### A.3 Verify via API (optional)

```
curl -s http://localhost:8000/api/health | jq '.packages // empty'
curl -s http://localhost:8000/api/packages/pi-core | jq '.[] | {name, installSource, version}'
```

`@mariozechner/pi-coding-agent` should not appear.

### A.4 Risks

| Risk | Mitigation |
|---|---|
| Live sessions still hold a `require.cache` entry to legacy fork | Stop the server first (step 1); existing pi child processes already loaded into memory keep running until ended |
| User is actually on 0.73.x as their primary | Confirm `pi --version` post-cleanup; if it fails, `npm i -g @earendil-works/pi-coding-agent@0.74.x` |

---

## 4. Plan B — Remove dashboard support for the legacy fork (follow-up)

**Not part of this work.** Listed here so we don't re-investigate later.

Touch points:

| File | Change |
|---|---|
| `packages/server/src/pi-core-checker.ts` | Drop `@mariozechner/pi-coding-agent` from `PI_CORE_PACKAGES` + `DISPLAY_NAME_OVERRIDES`; drop alias probe in `pi-version-skew.ts` |
| `packages/server/src/legacy-pi-cleanup.ts` | Delete file + callers |
| `packages/server/src/pi-version-skew.ts:95` | Drop legacy alias from probe list |
| `packages/extension/src/pi-env.d.ts` | Remove legacy `declare module "@mariozechner/pi-coding-agent"` shim (forces extension package.json to single-scope) |
| `packages/extension/package.json` | Drop `@mariozechner/pi-coding-agent` + `@mariozechner/pi-tui` peer/dev entries |
| `packages/extension/src/command-handler.ts` (and `dist/`) | Replace `import("@mariozechner/pi-coding-agent")` with new scope only |
| `packages/shared/src/platform/binary-lookup.ts` | Drop "legacy fork fallback" arm; collapse `[upstream, legacy]` arrays to `[upstream]` |
| `packages/shared/src/__tests__/binary-lookup-resolveJiti.test.ts` | Remove the "legacy fork fallback" cases |
| Repo-lint tests | Add a new lint forbidding `@mariozechner/pi-` strings outside an archived-changes folder |
| `docs/faq.md:1818`, `docs/architecture.md:514`, `docs/file-index-server.md`, `docs/file-index-shared.md`, `docs/file-index-extension.md` | Update entries; move to archived-changes section |
| `packages/electron/offline-packages.json` | Confirm it pins `@earendil-works/*` only (already does after `fix-electron-windows-installer-and-server-bootstrap`) |

Sequencing: requires an OpenSpec change (`openspec change new remove-legacy-pi-fork-detection`) because it deletes a public detection API + a documented FAQ flow. Gate on:
1. > 1 release of 0.74+ in the wild,
2. install-base telemetry (or maintainer judgement) showing legacy fork is rare.

---

## 5. Recommendation

Execute **Plan A** now. File **Plan B** as a future OpenSpec proposal — don't bundle them.

## 6. Open questions for the user

- Confirm Plan A is the intent (uninstall from this machine), not Plan B (rip out detection).
- If Plan B is the intent, confirm we should open an OpenSpec change rather than ad-hoc deletion.
