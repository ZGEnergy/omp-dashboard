## 0. Dependency gate (Monaco)

- [ ] 0.1 Confirm `add-internal-monaco-editor-pane` v1 is applied: `packages/shared/src/file-kind.ts`, the Monaco `markdown` viewer, and the extended `/api/file` read endpoint exist. If absent, Parts 2–4 below carry forward v3/v4 (write endpoint + edit-existing) for the markdown subset and remain the canonical write path.

## 1. Part 1 — Directory Settings page (no Monaco dependency)

- [ ] 1.1 Swap `FolderActionBar` entry-point: icon `mdiToyBrickOutline` → `mdiCog`; label/title "Pi Resources" → "Directory Settings". Update tests asserting the prior icon/label.
- [ ] 1.2 Add route `/folder/:cwd/settings/:page?` in `App.tsx` (pages: `instructions`, `packages`, `resources`; default `packages`). Add replace-redirect from legacy `/folder/:cwd/pi-resources` → `…/settings/packages`.
- [ ] 1.3 Add `hasFolderSettingsRoute` to `lib/mobile-depth.ts` route-flag derivation; verify mobile depth (list → detail) matches global settings behaviour.
- [ ] 1.4 Create `packages/client/src/components/DirectorySettings/DirectorySettings.tsx` — left-nav + mobile-hierarchy shell mirroring `SettingsPanel`, scoped to a `cwd` prop. Extract shared nav/mobile chrome into a presentational shell if duplication is real.
- [ ] 1.5 Mount existing Packages manage surface as the `packages` page and existing Resources listing as the `resources` page (reuse `PiResourcesView` internals; retire its local 2-tab bar).
- [ ] 1.6 Tests: cog button opens page; legacy route redirects; page nav updates URL; mobile depth correct.

## 2. Part 2 — Editable markdown surface (Monaco reuse)

- [ ] 2.1 In `packages/shared/src/file-kind.ts`, make `editable` resolve `true` for the writable markdown subset (extension `.md`/`.mdx`); keep `false` elsewhere. Update file-kind tests.
- [ ] 2.2 Make the Monaco `markdown` viewer support an editable mode (Monaco buffer, not read-only) behind the `editable` flag. Keep render-only path for non-editable mounts.
- [ ] 2.3 Build the `Instructions` page: scoped picker + editable markdown buffer + dirty-gated Save Bar (Save/Discard) mirroring `unify-settings-save-contract`. Add unsaved-changes navigation guard.
- [ ] 2.4 Mount `Instructions` as a page in `DirectorySettings` (directory scope, passes `cwd`) and in `SettingsPanel` → Advanced (global scope, no `cwd`).
- [ ] 2.5 Tests: Save Bar gating (clean=disabled, dirty=enabled); save clears dirty; unsaved-changes guard fires.

## 3. Part 3 — Write endpoint + scope-aware allowlist (security boundary)

- [ ] 3.1 Implement pure `isWritableMdTarget(absPath, { cwd? }): boolean` (shared or server lib). Dir scope: `<cwd>/**/*.md` + `<cwd>/.pi/**`. Global scope (no cwd): `~/.pi/agent/**/*.md` only. Realpath-normalize before check.
- [ ] 3.2 Exhaustive unit tests for the guard: in-scope `.md` allowed; non-`.md` rejected; `..` traversal rejected; symlink-escape (realpath) rejected; sibling-dir bypass rejected; global path outside `~/.pi/agent` rejected; missing-home handled.
- [ ] 3.3 Implement `POST /api/file/write` (advancing Monaco v3/v4 for markdown): body `{ cwd?, path, content, mtime }`; call `isWritableMdTarget` first (`403` on fail); compare on-disk mtime (`409 Conflict` on mismatch, no write); atomic write (tmp + rename, json-store pattern) on success; return new mtime.
- [ ] 3.4 Update `packages/shared/src/rest-api.ts` with the `POST /api/file/write` request/response types.
- [ ] 3.5 Server tests: `403` out-of-scope; `403` symlink escape; `409` mtime mismatch leaves file unchanged; success writes + returns new mtime; global vs dir branch both covered.

## 4. Part 4 — Scoped file picker

- [ ] 4.1 Server: candidate enumerator — directory scope from `pi-resource-scanner` output filtered to the allowlist; global scope from a small `~/.pi/agent` markdown walk. Both pass through `isWritableMdTarget` so picker ⊆ guard.
- [ ] 4.2 Add a list endpoint (or extend an existing one) returning scoped candidates; type in `rest-api.ts`.
- [ ] 4.3 Client `FilePicker` component: lists scoped candidates, selecting one loads it into the editor buffer. No free-form path input.
- [ ] 4.4 Tests: picker only lists allowlisted candidates; selecting loads buffer; directory vs global scope produce the right candidate sets.

## 5. Docs

- [ ] 5.1 (delegate to docs subagent, caveman style) Add file-index rows for `DirectorySettings/`, the `Instructions`/`MarkdownEditor`/`FilePicker` components, and `isWritableMdTarget`. Add a `docs/architecture.md` note: dashboard's first user-facing write surface + the scope-aware allowlist model + Monaco dependency.

## 6. Verification

- [ ] 6.1 `npm test` green (file-kind, guard, write endpoint, picker, page-route tests).
- [ ] 6.2 `npm run quality:changed` clean.
- [ ] 6.3 `openspec validate directory-settings-page-and-scoped-md-editing --strict` passes.
