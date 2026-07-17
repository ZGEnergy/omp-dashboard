/**
 * Unit tests for scripts/lib/upstream-sync-policy.sh path classification.
 *
 * Policy (prefer upstream same-intent product):
 *   protected → ours
 *   hub       → manual
 *   default   → theirs
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const POLICY = path.join(REPO_ROOT, "scripts", "lib", "upstream-sync-policy.sh");

function classify(relPath) {
  const script = `source "${POLICY}"; classify_conflict_path ${JSON.stringify(relPath)}`;
  return execFileSync("bash", ["-c", script], { encoding: "utf8" }).trim();
}

function isProtected(relPath) {
  const script = `source "${POLICY}"; if is_protected_path ${JSON.stringify(relPath)}; then echo yes; else echo no; fi`;
  return execFileSync("bash", ["-c", script], { encoding: "utf8" }).trim() === "yes";
}

function isHub(relPath) {
  const script = `source "${POLICY}"; if is_semantic_hub_path ${JSON.stringify(relPath)}; then echo yes; else echo no; fi`;
  return execFileSync("bash", ["-c", script], { encoding: "utf8" }).trim() === "yes";
}

describe("upstream-sync-policy classify_conflict_path", () => {
  it("classifies protected ZGE surfaces as ours", () => {
    const protectedPaths = [
      "deploy/install.sh",
      "deploy/systemd/omp-dashboard.service",
      "packages/server/src/push/dispatcher.ts",
      "packages/server/src/routes/push-routes.ts",
      "packages/server/src/routes/omp-config-routes.ts",
      "packages/shared/src/omp-agent-paths.ts",
      "packages/shared/src/input-needed-tools.ts",
      "packages/shared/src/__tests__/omp-agent-paths.test.ts",
      "packages/shared/src/__tests__/config-push.test.ts",
      "docs/upstream-sync.md",
      "scripts/upstream-sync.sh",
      "scripts/lib/upstream-sync-policy.sh",
      ".github/workflows/ci-zge.yml",
      ".github/workflows/upstream-sync.yml",
    ];
    for (const p of protectedPaths) {
      expect(classify(p), p).toBe("ours");
      expect(isProtected(p), p).toBe(true);
    }
  });

  it("classifies semantic hubs as manual", () => {
    const hubs = [
      "packages/server/src/server.ts",
      "packages/extension/src/bridge.ts",
      "packages/shared/src/config.ts",
      "package.json",
      "package-lock.json",
      "packages/client/package.json",
      "packages/server/package.json",
    ];
    for (const p of hubs) {
      expect(classify(p), p).toBe("manual");
      expect(isHub(p), p).toBe(true);
      expect(isProtected(p), p).toBe(false);
    }
  });

  it("prefers upstream for same-intent product code (the #313/#329 class)", () => {
    const product = [
      "packages/client/src/hooks/usePopoverFlip.ts",
      "packages/client/src/hooks/__tests__/usePopoverFlip.test.ts",
      "packages/client/src/components/ChatViewMenu.tsx",
      "packages/client/src/components/__tests__/ChatViewMenu.flip.test.tsx",
      "packages/client/src/hooks/AGENTS.md",
      "packages/client/src/components/ChatViewMenu.tsx.AGENTS.md",
      "packages/client/src/components/ModelSelector.tsx",
      "packages/server/src/event-wiring.ts",
      "docs/architecture.md",
      "CHANGELOG.md",
    ];
    for (const p of product) {
      expect(classify(p), p).toBe("theirs");
      expect(isProtected(p), p).toBe(false);
      expect(isHub(p), p).toBe(false);
    }
  });

  it("does not treat protected prefixes as product-theirs", () => {
    expect(classify("packages/server/src/push/web-push.ts")).toBe("ours");
    expect(classify("deploy/zrok/README.md")).toBe("ours");
  });

  it("does not auto-theirs package manifests under packages/*", () => {
    expect(classify("packages/extension/package.json")).toBe("manual");
    expect(classify("packages/roles-plugin/package.json")).toBe("manual");
  });
});
