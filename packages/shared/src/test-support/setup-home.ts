/**
 * Vitest globalSetup: tripwire + directory bootstrap.
 *
 * Wired via `test.globalSetup` in each package's `vitest.config.ts`. Runs ONCE
 * at vitest boot, before any test file is loaded.
 *
 * Responsibilities:
 *   1. Tripwire — throws if `process.env.HOME` still points at the developer's
 *      real user home (meaning the root `npm test` script wasn't used and HOME
 *      wasn't overridden). Aborts the entire run before any destructive code
 *      can touch real ~/.pi/.
 *   2. Pre-create `<HOME>/.pi/agent/sessions/` and `<HOME>/.pi/dashboard/` so
 *      production code that reads those paths finds empty but well-formed
 *      directories.
 *
 * Why globalSetup (not setupFiles):
 *   setupFiles' `beforeAll` can run AFTER a test file's top-level imports
 *   execute destructive module-level code. globalSetup runs strictly before
 *   ANY test file is loaded. Combined with the `npm test` process-level HOME
 *   override, there is zero window in which code can see real HOME.
 *
 * The process-level HOME override in package.json is the primary isolation
 * layer; this module is the second-line tripwire that catches regressions.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

/** Vitest globalSetup default export. Returns a teardown function. */
export default function setup() {
  const currentHome = process.env.HOME ?? "";
  const realHome = os.userInfo().homedir;

  if (!currentHome) {
    throw new Error(
      "[test-isolation] process.env.HOME is empty. " +
        "Run tests via `npm test` (which sets HOME to a tmp dir) " +
        "or prefix manually: `HOME=$(mktemp -d) npx vitest run`.",
    );
  }

  if (currentHome === realHome) {
    throw new Error(
      `[test-isolation] process.env.HOME (${currentHome}) equals the real user home ` +
        `(${realHome}). This would let tests read and mutate ~/.pi/, potentially killing ` +
        `live pi sessions. Run tests via \`npm test\` — it sets HOME to an ephemeral tmp dir. ` +
        `If you invoked vitest directly, prefix with \`HOME=$(mktemp -d)\`.`,
    );
  }

  if (!currentHome.startsWith(os.tmpdir())) {
    // Not strictly fatal — developer may have pointed HOME at a custom scratch dir —
    // but warn loudly because it's unusual.
    // eslint-disable-next-line no-console
    console.warn(
      `[test-isolation] HOME (${currentHome}) is not under os.tmpdir() (${os.tmpdir()}). ` +
        `Tests will still run but this layout is unusual.`,
    );
  }

  // Pre-create expected .pi subdirectories so code that reads them finds empty dirs.
  mkdirSync(join(currentHome, ".pi", "agent", "sessions"), { recursive: true });
  mkdirSync(join(currentHome, ".pi", "dashboard"), { recursive: true });

  // eslint-disable-next-line no-console
  console.log(`[test-isolation] HOME=${currentHome} (real=${realHome})`);

  // Teardown: nothing to do. The tmp HOME was created by the npm script's
  // `$(mktemp -d)`; leaving the dir on disk is fine (OS cleans tmpdir).
  // Tests that need per-file isolation continue to use their own mkdtemp.
  return () => {
    /* no-op */
  };
}
