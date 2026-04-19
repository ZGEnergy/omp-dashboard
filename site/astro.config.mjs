import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import mdx from "@astrojs/mdx";
import preact from "@astrojs/preact";

// https://astro.build/config
export default defineConfig({
  site: "https://blackbelttechnology.github.io",
  base: "/pi-agent-dashboard",
  output: "static",
  integrations: [
    tailwind({ applyBaseStyles: false }),
    mdx(),
    preact({ compat: true }),
  ],
  vite: {
    ssr: {
      noExternal: ["motion"],
    },
  },
});
