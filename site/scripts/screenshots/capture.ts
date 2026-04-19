/**
 * Playwright screenshot pipeline for the marketing site.
 *
 * Two modes:
 *
 *   1. TARGET an existing running dashboard (recommended for v1):
 *
 *        SCREENSHOT_TARGET_URL=http://localhost:8000 npm run screenshots
 *
 *      This is the fastest path — you use your real dashboard, rich with
 *      real sessions, and the script just captures. No server spawn.
 *
 *   2. SPAWN a fresh dashboard with fixture data:
 *
 *        npm run screenshots
 *
 *      The script creates a temp HOME, seeds fixture sessions, starts
 *      `pi-dashboard` on a random port, captures, and cleans up.
 *      Richness of seeded data is intentionally minimal — see
 *      fixtures/README.md.
 *
 * Output: <repo>/site/public/screenshots/{desktop,mobile}/<name>.png
 *
 * Generated files are committed to git.
 */

import { chromium, type Browser, type BrowserContext } from "playwright";
import {
  mkdir,
  rm,
  mkdtemp,
} from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { DESKTOP, MOBILE, type Viewport } from "./viewports.js";
import {
  DESKTOP_ROUTES,
  MOBILE_ROUTES,
  type RouteShot,
} from "./routes.js";
import { seedHome } from "./seed.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(HERE, "../..");
const OUT_DIR = join(SITE_ROOT, "public", "screenshots");

interface RunContext {
  baseUrl: string;
  cleanup: () => Promise<void>;
}

async function acquireDashboard(): Promise<RunContext> {
  const targetUrl = process.env.SCREENSHOT_TARGET_URL;
  if (targetUrl) {
    console.log(`[capture] targeting existing dashboard at ${targetUrl}`);
    return {
      baseUrl: targetUrl.replace(/\/+$/, ""),
      cleanup: async () => {},
    };
  }

  // Spawn a fresh dashboard with a temp HOME.
  const home = await mkdtemp(join(tmpdir(), "pi-dashboard-shots-"));
  await seedHome(home);

  const port = 18000 + Math.floor(Math.random() * 1000);
  console.log(`[capture] spawning pi-dashboard on port ${port} (HOME=${home})`);

  const child: ChildProcess = spawn(
    "pi-dashboard",
    ["start", "--port", String(port)],
    {
      env: { ...process.env, HOME: home },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout?.on("data", (b) => process.stdout.write(`[server] ${b}`));
  child.stderr?.on("data", (b) => process.stderr.write(`[server!] ${b}`));

  const baseUrl = `http://localhost:${port}`;
  await waitForServer(baseUrl, 15000);

  return {
    baseUrl,
    cleanup: async () => {
      child.kill("SIGTERM");
      await sleep(500);
      if (!child.killed) child.kill("SIGKILL");
      await rm(home, { recursive: true, force: true });
    },
  };
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = `${url}/api/health`;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error(`Server at ${url} did not come up within ${timeoutMs}ms`);
}

async function captureOne(
  browser: Browser,
  viewport: Viewport,
  baseUrl: string,
  route: RouteShot,
): Promise<void> {
  const context: BrowserContext = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  const url = `${baseUrl}${route.path}`;
  console.log(`[capture] ${viewport.id.padEnd(8)} ${route.name.padEnd(22)} ← ${url}`);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
    if (route.waitFor) {
      await page.waitForSelector(route.waitFor, { timeout: 5000 }).catch(() => {});
    }
    await sleep(route.delay ?? 400);
    const outDir = join(OUT_DIR, viewport.id);
    await mkdir(outDir, { recursive: true });
    await page.screenshot({
      path: join(outDir, `${route.name}.png`),
      type: "png",
      fullPage: false,
    });
  } catch (err) {
    console.warn(`[capture] ! ${route.name} failed: ${(err as Error).message}`);
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const run = await acquireDashboard();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const route of DESKTOP_ROUTES) {
      await captureOne(browser, DESKTOP, run.baseUrl, route);
    }
    for (const route of MOBILE_ROUTES) {
      await captureOne(browser, MOBILE, run.baseUrl, route);
    }
    console.log(`\n[capture] ✓ done → ${OUT_DIR}`);
  } finally {
    await browser.close();
    await run.cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
