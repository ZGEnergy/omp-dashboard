# Publishing Plugin Packages to npm

This monorepo enforces **lockstep versioning** — every workspace `package.json`
must share the same `version` string (enforced by `scripts/sync-versions.js`,
which `exit 1`s if any package drifts). The release workflow
(`.github/workflows/publish.yml`) bumps every workspace in lockstep on every
release tag.

That's a problem for **first-time publishing of a new plugin**: the plugin
inherits the current monorepo version (e.g. `0.4.5`) on its very first npm
publish, even though it has never existed on npm before. If you'd rather
seed the package at `0.0.1` (true initial release), the procedure below
preserves the lockstep invariant by doing a **one-shot manual publish, then
reverting** before any commit.

## When to use this procedure

**You MUST do a local manual seed publish for every brand-new plugin.**
This is non-optional, because of npm's chicken-and-egg constraint:

- `.github/workflows/publish.yml` publishes via **OIDC / Trusted Publisher
  only** — there is intentionally no `NPM_TOKEN` secret in the repo.
- npmjs.com **only lets you configure Trusted Publisher on a package that
  already exists** (Settings → Trusted Publisher is grey-locked until the
  package has at least one published version).

So a brand-new package's first publish CANNOT come from the workflow — it
must come from a developer's machine with `npm login`. After that first
publish lands on npm, you configure Trusted Publisher on npmjs.com, and
every subsequent release publishes automatically via the workflow's OIDC
path.

Whether you seed at `0.0.1` (one-shot, then revert — steps 4–7 below) or
at the current lockstep version (skip 4–7, just publish at e.g. `0.4.5`)
is a stylistic choice. Either way, **the manual local publish in step 6
is required for every new plugin**.

## Procedure

### 1. Drop `private`, add `publishConfig` and `license`

Edit the new plugin's `package.json`:

```jsonc
{
  "name": "@blackbelt-technology/pi-dashboard-<your-plugin>-plugin",
  "version": "0.4.5",                    // current lockstep version
  // REMOVE: "private": true,
  "license": "MIT",                       // ADD
  "publishConfig": {                      // ADD
    "access": "public"
  },
  "type": "module",
  // … exports / files / pi-dashboard-plugin block stay as-is …
}
```

### 2. Declare every runtime workspace dep explicitly

In the monorepo, workspace packages are linked by npm's `workspaces:` hoist,
so an unimported plugin can `import "@blackbelt-technology/dashboard-plugin-runtime/context"`
without declaring it in `dependencies`. **This breaks once the package is
published** — npm consumers don't have the hoist.

Grep your plugin's source for every `@blackbelt-technology/*` import, then
make sure each one appears in `dependencies` of the plugin's `package.json`
with a `^<lockstep-version>` specifier. Example:

```bash
grep -rEh "from \"@blackbelt-technology/[^\"]+\"" packages/<your-plugin>/src \
  | sed 's|.*from "\(@blackbelt-technology/[^/"]*\).*|\1|' | sort -u
```

### 3. Add the plugin to the publish workflow

Edit `.github/workflows/publish.yml` and add the plugin to the `PACKAGES=(...)`
bash array. Position matters:

- **After** `dashboard-plugin-runtime` (plugins depend on it).
- **Before** `@blackbelt-technology/pi-agent-dashboard` (the root metapackage,
  which depends on every sub-package and MUST publish last).

```bash
PACKAGES=(
  "@blackbelt-technology/pi-dashboard-shared"
  "@blackbelt-technology/pi-dashboard-extension"
  "@blackbelt-technology/pi-dashboard-server"
  "@blackbelt-technology/pi-dashboard-web"
  "@blackbelt-technology/dashboard-plugin-runtime"
  "@blackbelt-technology/pi-dashboard-flows-plugin"
  "@blackbelt-technology/pi-dashboard-jj-plugin"
  "@blackbelt-technology/pi-dashboard-<your-new-plugin>"   # ADD HERE
  "@blackbelt-technology/pi-agent-dashboard"
)
```

### 4. (One-shot 0.0.1 seed only) Bump the new plugin to 0.0.1

```bash
# Edit ONLY the new plugin's package.json — leave every other workspace alone.
# This breaks lockstep temporarily; we revert in step 7.
sed -i '' 's/"version": "0.4.5"/"version": "0.0.1"/' \
  packages/<your-plugin>/package.json
```

Do NOT run `npm install` or `node scripts/sync-versions.js` while in this
state — the latter will refuse with "Lockstep invariant violated".

### 5. Dry-run the publish

```bash
npm publish --workspace=@blackbelt-technology/pi-dashboard-<your-plugin> --dry-run
```

Verify the file list is what you expect (only what `files: ["src/"]` covers),
package size is sane (< 1 MB usually), and the version is `0.0.1`.

### 6. Publish for real

You need to be logged in to npm with publish rights on the
`@blackbelt-technology` scope:

```bash
npm whoami                   # confirm you're logged in
npm publish --workspace=@blackbelt-technology/pi-dashboard-<your-plugin> \
  --access public
```

> ⚠️ **Why this step is local, not in CI** — npm's Trusted Publisher
> (OIDC) is grey-locked until a package has at least one version on npm.
> Our workflow has no `NPM_TOKEN`, so it can never publish a brand-new
> package. The very first `npm publish` of any new package MUST come
> from a developer's machine with `npm login`. Once it lands, configure
> Trusted Publisher on npmjs.com:
>
> - Package → Settings → Trusted Publisher → Add
> - Publisher: GitHub Actions
> - Owner: `BlackBeltTechnology`
> - Repository: `pi-agent-dashboard`
> - Workflow filename: `publish.yml`
> - Environment: (leave blank)
>
> Until Trusted Publisher is configured, every subsequent workflow run
> will fail to publish that package (the per-package `FAIL=1` loop in
> `publish.yml` isolates the failure so the other packages still
> publish, but the new plugin won't update until you fix it). You only
> have to do this once per package, ever.

### 7. Revert version to the lockstep value

```bash
sed -i '' 's/"version": "0.0.1"/"version": "0.4.5"/' \
  packages/<your-plugin>/package.json
node scripts/sync-versions.js   # MUST report "Lockstep invariant OK"
```

### 8. Commit

```bash
git add packages/<your-plugin>/package.json .github/workflows/publish.yml
git commit -m "chore(release): make <your-plugin> publishable"
```

The git history shows the package at the lockstep version (`0.4.5`); only
npm sees the `0.0.1` seed. The next release tag will publish the plugin at
the new lockstep version (e.g. `0.4.6`) via the regular workflow.

## Verification checklist

- [ ] `node scripts/sync-versions.js` exits 0 with "Lockstep invariant OK"
- [ ] `npm view @blackbelt-technology/pi-dashboard-<your-plugin> version`
      returns `0.0.1`
- [ ] Trusted Publisher configured on npmjs.com for the new package
- [ ] Plugin appears in `publish.yml`'s `PACKAGES=(...)` array
- [ ] All `@blackbelt-technology/*` imports declared in `dependencies`

## See also

- `.github/workflows/publish.yml` — per-package skip-if-exists loop, Trusted
  Publisher / OIDC config notes
- `scripts/sync-versions.js` — lockstep invariant enforcer
- `packages/dashboard-plugin-runtime/package.json` — reference layout for a
  publishable plugin-adjacent workspace package
