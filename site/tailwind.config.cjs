/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{astro,html,md,mdx,js,jsx,ts,tsx}",
    "./src/content/**/*.ts",
  ],
  // `class` strategy — `<html>` carries `.dark` or no class for light mode.
  // The inline script in Base.astro chooses the initial class before paint.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Pi palette, fully driven by CSS variables defined in global.css.
        // Each token accepts Tailwind's <alpha-value> placeholder so opacity
        // utilities (e.g. bg-pi-surface/60) still work.
        pi: {
          bg: "rgb(var(--pi-bg) / <alpha-value>)",
          surface: "rgb(var(--pi-surface) / <alpha-value>)",
          "surface-alt": "rgb(var(--pi-surface-alt) / <alpha-value>)",
          border: "rgb(var(--pi-border) / <alpha-value>)",
          fg: "rgb(var(--pi-fg) / <alpha-value>)",
          muted: "rgb(var(--pi-muted) / <alpha-value>)",
          accent: "rgb(var(--pi-accent) / <alpha-value>)",
          accent2: "rgb(var(--pi-accent2) / <alpha-value>)",
          success: "rgb(var(--pi-success) / <alpha-value>)",
          warn: "rgb(var(--pi-warn) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      backgroundSize: {
        "dot-grid": "32px 32px",
      },
      boxShadow: {
        "pi-glow":
          "0 0 0 1px rgb(var(--pi-accent) / 0.15), 0 20px 80px -20px rgb(var(--pi-accent) / 0.35)",
      },
      animation: {
        "pi-hue": "pi-hue 30s linear infinite",
        "pi-float": "pi-float 6s ease-in-out infinite",
        "pi-pulse-soft": "pi-pulse-soft 3s ease-in-out infinite",
        "pi-dash": "pi-dash 2s linear infinite",
      },
      keyframes: {
        "pi-hue": {
          "0%,100%": { filter: "hue-rotate(0deg)" },
          "50%": { filter: "hue-rotate(30deg)" },
        },
        "pi-float": {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "pi-pulse-soft": {
          "0%,100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        "pi-dash": {
          to: { strokeDashoffset: "-20" },
        },
      },
    },
  },
  plugins: [],
};
