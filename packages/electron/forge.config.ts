import type { ForgeConfig } from "@electron-forge/shared-types";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Only include bundled Node.js if it exists (CI downloads it; local builds skip it)
const bundledNodePath = path.resolve(__dirname, "resources/node");
const extraResource = fs.existsSync(bundledNodePath) ? [bundledNodePath] : [];

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: "PI-Dashboard",
    executableName: "pi-dashboard",
    icon: path.resolve(__dirname, "resources/icon"),
    appBundleId: "com.blackbelt-technology.pi-dashboard",
    // macOS: support Catalina (10.15) and newer (requires Electron 32.x)
    darwinDarkModeSupport: true,
    // macOS universal binary (arm64 + x64)
    ...(process.platform === "darwin" ? { arch: "universal" as any } : {}),
    extraResource: [
      ...extraResource,
      "./src/renderer",
      "./resources/dirname-shim.js",
      // Tray icons for macOS (template images) and Windows/Linux
      "./resources/trayTemplate.png",
      "./resources/trayTemplate@2x.png",
      "./resources/icon.png",
      "./resources/icon.ico",
      // Bundled server (created by scripts/bundle-server.sh)
      ...(fs.existsSync(path.resolve(__dirname, "resources/server")) ? ["./resources/server"] : []),
    ],
    // macOS code signing — requires APPLE_IDENTITY env var in CI
    ...(process.env.APPLE_IDENTITY ? {
      osxSign: {
        identity: process.env.APPLE_IDENTITY,
        hardenedRuntime: true,
        entitlements: "entitlements.plist",
        "entitlements-inherit": "entitlements.plist",
      },
      osxNotarize: {
        appleId: process.env.APPLE_ID || "",
        appleIdPassword: process.env.APPLE_ID_PASSWORD || "",
        teamId: process.env.APPLE_TEAM_ID || "",
      },
    } : {}),
  },
  makers: [
    {
      name: "@electron-forge/maker-dmg",
      config: {
        name: "PI Dashboard",
        title: "PI Dashboard",
        icon: path.resolve(__dirname, "resources/icon.icns"),
        format: "ULFO",
      },
    },
    {
      name: "@electron-forge/maker-deb",
      config: {
        options: {
          name: "pi-dashboard",
          bin: "pi-dashboard",
          productName: "PI Dashboard",
          genericName: "Dashboard",
          description: "Monitor and interact with pi agent sessions",
          productDescription: "Web-based dashboard for monitoring and interacting with pi agent sessions remotely. Provides session management, terminal access, file browsing, and real-time event streaming.",
          icon: path.resolve(__dirname, "resources/icon.png"),
          categories: ["Development", "Utility"],
          desktopTemplate: path.resolve(__dirname, "resources/desktop.ejs"),
          maintainer: "Blackbelt Technology",
          homepage: "https://github.com/BlackBeltTechnology/pi-agent-dashboard",
        },
      },
    },
    {
      name: "@pengx17/electron-forge-maker-appimage",
      config: {},
    },
    {
      name: "@felixrieseberg/electron-forge-maker-nsis",
      config: {
        oneClick: true,
        perMachine: false,
        // Prevent electron-builder from auto-publishing when GITHUB_TOKEN is set
        publish: "never",
      },
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-vite",
      config: {
        build: [
          {
            entry: "src/main.ts",
            config: "vite.main.config.ts",
            target: "main",
          },
          {
            entry: "src/preload.ts",
            config: "vite.preload.config.ts",
            target: "preload",
          },
        ],
        renderer: [],
      },
    },
  ],
};

export default config;
