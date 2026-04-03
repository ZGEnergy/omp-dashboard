import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "src/client",
  publicDir: "../../public",
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
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
