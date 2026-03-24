#!/usr/bin/env node --import tsx
/**
 * PI Dashboard Server CLI
 */
import { createServer, type ServerConfig } from "./server.js";
import { loadConfig, ensureConfig } from "../shared/config.js";

function parseArgs(args: string[]): Partial<ServerConfig> {
  const result: Partial<ServerConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === "--port" && next) {
      result.port = parseInt(next, 10);
      i++;
    } else if (arg === "--pi-port" && next) {
      result.piPort = parseInt(next, 10);
      i++;
    } else if (arg === "--dev") {
      result.dev = true;
    } else if (arg === "--no-tunnel") {
      result.tunnel = false;
    }
  }

  return result;
}

async function main() {
  ensureConfig();

  const cliArgs = parseArgs(process.argv.slice(2));
  const fileConfig = loadConfig();

  // Precedence: CLI flags → env vars → config file (with defaults already applied)
  const config: ServerConfig = {
    port: cliArgs.port ?? (parseInt(process.env.PI_DASHBOARD_PORT ?? "") || null) ?? fileConfig.port,
    piPort: cliArgs.piPort ?? (parseInt(process.env.PI_DASHBOARD_PI_PORT ?? "") || null) ?? fileConfig.piPort,
    dev: cliArgs.dev ?? false,
    autoShutdown: fileConfig.autoShutdown,
    shutdownIdleSeconds: fileConfig.shutdownIdleSeconds,
    tunnel: cliArgs.tunnel ?? fileConfig.tunnel.enabled,
  };

  const server = await createServer(config);

  // Handle shutdown (once only)
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      console.log("Force exit.");
      process.exit(1);
    }
    shuttingDown = true;
    console.log("\nShutting down...");
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.start();
}

main().catch((err) => {
  console.error("Failed to start dashboard:", err);
  process.exit(1);
});
