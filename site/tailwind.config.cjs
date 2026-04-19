/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{astro,html,md,mdx,js,jsx,ts,tsx}",
    "./src/content/**/*.ts",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Pi-blue palette — canonical tokens re-exposed as named colors
        // so components can read `bg-pi-bg`, `text-pi-accent`, etc.
        pi: {
          bg: "#020617",       // slate-950
          surface: "#0f172a",  // slate-900
          border: "#1e293b",   // slate-800
          fg: "#f8fafc",       // slate-50
          muted: "#94a3b8",    // slate-400
          accent: "#818cf8",   // indigo-400
          accent2: "#8b5cf6",  // violet-500
          success: "#34d399",  // emerald-400
          warn: "#fbbf24",     // amber-400
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
      backgroundImage: {
        "pi-radial":
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgb(99 102 241 / 0.25), transparent 70%)",
        "pi-dot-grid":
          "radial-gradient(circle at 1px 1px, rgb(30 41 59 / 0.5) 1px, transparent 0)",
        "pi-card-border":
          "linear-gradient(135deg, rgba(129,140,248,0.6), rgba(139,92,246,0.3) 50%, transparent 100%)",
      },
      backgroundSize: {
        "dot-grid": "32px 32px",
      },
      boxShadow: {
        "pi-glow":
          "0 0 0 1px rgba(129,140,248,0.15), 0 20px 80px -20px rgba(129,140,248,0.35)",
        "pi-card":
          "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 20px 40px -20px rgba(2,6,23,0.8)",
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
