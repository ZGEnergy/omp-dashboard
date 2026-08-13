import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKTREE_ROOT = resolve(__dirname, "..");
const CACHE_DIR = join(WORKTREE_ROOT, "node_modules", ".cache", "measure");

mkdirSync(CACHE_DIR, { recursive: true });

function resolveSpec(spec) {
  if (spec.startsWith(".") || spec.startsWith("packages/")) {
    return resolve(WORKTREE_ROOT, spec);
  }
  return spec;
}

const TARGETS = [
  { id: "bonjour-service", label: "bonjour-service", specs: ["bonjour-service"] },
  { id: "mdns-discovery", label: "@blackbelt-technology/pi-dashboard-shared/mdns-discovery.js", specs: ["@blackbelt-technology/pi-dashboard-shared/mdns-discovery.js"] },
  { id: "yaml", label: "yaml", specs: ["yaml"] },
  { id: "config", label: "@blackbelt-technology/pi-dashboard-shared/config.js", specs: ["@blackbelt-technology/pi-dashboard-shared/config.js"] },
  { id: "role-manager", label: "packages/extension/src/role-manager.ts", specs: ["./packages/extension/src/role-manager.ts"] },
  { id: "bridge-deferred", label: "packages/extension/src/bridge.ts (deferred / post-change)", specs: ["./packages/extension/src/bridge.ts"] },
  { id: "bridge-static-simulated", label: "packages/extension/src/bridge.ts (simulated static mDNS / pre-change)", specs: ["@blackbelt-technology/pi-dashboard-shared/mdns-discovery.js", "./packages/extension/src/bridge.ts"] },
];

const ITERATIONS = 5;

function runSample(specs) {
  const tmpDir = mkdtempSync(join(CACHE_DIR, "run-"));
  const runnerPath = join(tmpDir, "runner.mts");
  const resolvedSpecs = specs.map(resolveSpec);
  const code = `
import { performance } from "node:perf_hooks";
const t0 = performance.now();
for (const spec of ${JSON.stringify(resolvedSpecs)}) {
  await import(spec);
}
const elapsed = performance.now() - t0;
console.log(elapsed.toFixed(4));
`;

  writeFileSync(runnerPath, code, "utf8");

  try {
    const out = execFileSync("npx", ["tsx", runnerPath], {
      cwd: WORKTREE_ROOT,
      env: { ...process.env, HOME: tmpDir },
      encoding: "utf8",
    });
    return parseFloat(out.trim());
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    samples: sorted.map((s) => Number(s.toFixed(2))),
  };
}

async function main() {
  console.log(`Running module evaluation timing benchmark (${ITERATIONS} iterations per target)...\n`);

  const results = {};

  for (const target of TARGETS) {
    process.stdout.write(`Measuring ${target.label} ... `);
    const samples = [];
    for (let i = 0; i < ITERATIONS; i++) {
      samples.push(runSample(target.specs));
    }
    const st = stats(samples);
    results[target.id] = { label: target.label, ...st };
    console.log(`median: ${st.median} ms (min: ${st.min.toFixed(2)} ms, max: ${st.max.toFixed(2)} ms)`);
  }

  console.log("\nSummary Table:");
  console.log("-----------------------------------------------------------------------------------------");
  console.log(
    "Target".padEnd(65) +
      "Median (ms)".padStart(12) +
      "Mean (ms)".padStart(12)
  );
  console.log("-----------------------------------------------------------------------------------------");
  for (const item of Object.values(results)) {
    console.log(
      item.label.padEnd(65) +
        String(item.median.toFixed(2)).padStart(12) +
        String(item.mean.toFixed(2)).padStart(12)
    );
  }
  console.log("-----------------------------------------------------------------------------------------");

  const diffMs = Number((results["bridge-static-simulated"].median - results["bridge-deferred"].median).toFixed(2));
  console.log(`\nExtension startup module-evaluation reduction: ~${diffMs} ms (from ${results["bridge-static-simulated"].median} ms to ${results["bridge-deferred"].median} ms)\n`);

  console.log("JSON Output:");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
