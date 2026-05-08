import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
// Import via a relative workspace path so vite's esbuild config-loader bundles
// the plugin (and its transitive .ts deps) into the temp config bundle. Using
// the package specifier "@blackbelt-technology/dashboard-plugin-runtime"
// instead would externalize the module and hit ERR_MODULE_NOT_FOUND because
// the runtime ships raw .ts (no compiled dist) and Node can't resolve
// `.js`-extensioned internal imports back to `.ts` at runtime.
import { viteDashboardPluginsPlugin } from "../dashboard-plugin-runtime/src/vite-plugin/index.js";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteDashboardPluginsPlugin(path.resolve(__dirname, "../..")),
  ],
  root: "src",
  // publicDir is resolved relative to `root` (= packages/client/src/), so three
  // `../` hops are needed to reach the project-root public/ directory which
  // holds icon-192.png, manifest.json, sw.js, etc.
  publicDir: "../../../public",
  resolve: {
    alias: {
      "@blackbelt-technology/pi-dashboard-shared": path.resolve(__dirname, "../shared/src"),
      "@blackbelt-technology/pi-dashboard-client-utils": path.resolve(__dirname, "../client-utils/src"),
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    // Split the main bundle so no single chunk exceeds ~500 KB. This avoids
    // zrok / free-tunnel aborts on large static assets and improves caching
    // (only changed chunks invalidate).
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          const chunks: Record<string, string[]> = {
            "react-vendor": ["react", "react-dom"],
            "markdown": ["react-markdown", "remark-gfm", "rehype-raw", "dompurify"],
            "syntax": ["react-syntax-highlighter"],
            "diff": [
              "@git-diff-view/core",
              "@git-diff-view/file",
              "@git-diff-view/lowlight",
              "@git-diff-view/react",
              "diff",
            ],
            "xterm": [
              "@xterm/xterm",
              "@xterm/addon-attach",
              "@xterm/addon-fit",
            ],
            "dnd": [
              "@dnd-kit/core",
              "@dnd-kit/sortable",
              "@dnd-kit/utilities",
            ],
            "util": ["fuse.js", "qrcode", "wouter", "ansi-to-react"],
          };
          for (const [chunk, deps] of Object.entries(chunks)) {
            if (deps.some((dep) => id.includes(`/node_modules/${dep}/`))) {
              return chunk;
            }
          }
        },
      },
    },
    // Raise the warning limit — mermaid and cytoscape chunks are already
    // code-split by vite's dynamic-import detection and don't need further
    // splitting.
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 3000,
    hmr: {
      // When served through the dashboard server (port 8000), HMR WebSocket
      // must connect directly to Vite's port, not the dashboard's.
      clientPort: 3000,
    },
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
});
