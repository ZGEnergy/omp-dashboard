#!/usr/bin/env node
/**
 * pi-dashboard CLI entry point.
 *
 * The actual CLI is `../src/cli.ts`. This wrapper exists because a
 * `#!/usr/bin/env` shebang cannot interpolate a dynamic `--import`
 * loader path. The wrapper resolves jiti at runtime from pi's tree
 * and re-execs Node with `--import <jiti-url> cli.ts`.
 *
 * Jiti-only — no tsx fallback. When jiti cannot be resolved, exit 1
 * with a stderr install-hint. tsx is being fully extruded from
 * runtime + bootstrap (see proposal: replace-tsx-with-jiti).
 *
 * Kept as plain ESM JS so it needs no loader to parse itself.
 */
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "..", "src", "cli.ts");

// Mirrors packages/shared/src/resolve-jiti.ts JITI_PACKAGES list.
// Inlined because we cannot import a .ts module before the loader
// is registered.
const JITI_PACKAGES = ["jiti", "@mariozechner/jiti"];

/** Resolve pi's jiti register hook as a file:// URL. Returns null on miss. */
function resolveJitiUrl() {
  const anchor = process.argv[1];
  if (!anchor) return null;
  let resolved;
  try {
    resolved = realpathSync(anchor);
  } catch {
    return null;
  }
  const req = createRequire(resolved);
  for (const pkg of JITI_PACKAGES) {
    try {
      const pkgJson = req.resolve(`${pkg}/package.json`);
      const registerPath = join(dirname(pkgJson), "lib", "jiti-register.mjs");
      return pathToFileURL(registerPath).href;
    } catch {
      /* try next */
    }
  }
  return null;
}

const loader = resolveJitiUrl();
if (!loader) {
  console.error(
    "pi-dashboard: cannot find jiti. " +
      "Install pi: 'npm install -g @earendil-works/pi-coding-agent'",
  );
  process.exit(1);
}

// Mirrors shouldUrlWrapEntry() in packages/shared/src/platform/node-spawn.ts:
// jiti needs the entry URL-wrapped on Windows (Node rejects raw drive-letter
// paths for --import). POSIX + jiti accepts raw paths.
const wrapEntry = process.platform === "win32";
const entry = wrapEntry ? pathToFileURL(cliPath).href : cliPath;

const child = spawn(
  process.execPath,
  ["--import", loader, entry, ...process.argv.slice(2)],
  { stdio: "inherit", windowsHide: true },
);

child.on("exit", (code, signal) => {
  if (signal) {
    // Re-raise the signal so the parent shell sees the same exit reason.
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

child.on("error", (err) => {
  console.error("[pi-dashboard] Failed to spawn Node:", err.message);
  process.exit(1);
});
