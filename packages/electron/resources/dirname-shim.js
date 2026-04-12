/**
 * Global __dirname/__filename shim for ESM modules.
 * Loaded via: node --import ./dirname-shim.js --import tsx ...
 *
 * Some CJS dependencies (e.g. node-pty) use __dirname but get
 * loaded as ESM when the nearest package.json has "type": "module".
 * This shim provides fallback globals so they don't crash.
 */
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

if (typeof globalThis.__dirname === "undefined") {
  // Provide a process-level fallback (will be overridden per-module by proper loaders)
  Object.defineProperty(globalThis, "__dirname", {
    get() {
      // Return cwd as fallback — individual modules should define their own
      return process.cwd();
    },
    configurable: true,
  });
}

if (typeof globalThis.__filename === "undefined") {
  Object.defineProperty(globalThis, "__filename", {
    get() {
      return "";
    },
    configurable: true,
  });
}
