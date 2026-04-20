## Context

`loadPiPackageManager()` in `packages/server/src/package-manager-wrapper.ts` lazily imports pi's `DefaultPackageManager` and `SettingsManager` at runtime. It currently has two resolution paths:

1. **Direct import** — `import("@mariozechner/pi-coding-agent")` — works when pi is a dependency
2. **Global npm** — `npm root -g` + file path — works when pi is installed globally

On portable Windows (Electron standalone), the wizard installs pi into `~/.pi-dashboard/node_modules/` via `dependency-installer.ts`. Neither resolution path finds it there.

## Goals / Non-Goals

**Goals:**
- `loadPiPackageManager()` resolves pi from the managed install at `~/.pi-dashboard/node_modules/`
- Existing resolution paths (direct import, global npm) remain unchanged
- No new dependencies introduced

**Non-Goals:**
- Changing the managed install location or structure
- Refactoring the overall package manager architecture
- Adding resolution for other managed dependencies (only pi is needed here)

## Decisions

### 1. Insert managed-install check between direct import and global npm

**Rationale:** The managed install is a more specific and reliable location than `npm root -g`. Checking it before the global npm fallback avoids the `execSync("npm root -g")` call (which may fail or be slow on Windows) when pi is already available locally.

**Alternative considered:** Checking managed install after global npm — rejected because the managed path is faster (no subprocess) and is the expected location on portable installs.

### 2. Use `os.homedir()` + hardcoded `".pi-dashboard"` path

**Rationale:** This matches the `MANAGED_DIR` constant in `packages/electron/src/lib/managed-paths.ts`. Importing that module is not feasible since the server package doesn't depend on the Electron package. Hardcoding is acceptable because this path is a stable convention shared across components.

### 3. Check both `@mariozechner/pi-coding-agent` and `@oh-my-pi/pi-coding-agent` package names

**Rationale:** Consistent with the existing global npm resolution which already checks both variants.

## Risks / Trade-offs

- **[Hardcoded path]** → The `~/.pi-dashboard` path is duplicated across packages. If it ever changes, both locations need updating. Mitigated by the path being a stable convention documented in `managed-paths.ts`.
- **[Minimal risk]** → The new code path only adds a `try/catch` around a dynamic import with a file URL. If the path doesn't exist, it silently falls through to the next resolution strategy.
