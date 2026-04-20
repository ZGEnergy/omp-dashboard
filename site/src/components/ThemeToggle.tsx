import { useEffect, useState } from "preact/hooks";

type Mode = "system" | "light" | "dark";

const OPTIONS: { id: Mode; label: string; icon: preact.JSX.Element }[] = [
  {
    id: "system",
    label: "System",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <line x1="8" y1="20" x2="16" y2="20" />
        <line x1="12" y1="16" x2="12" y2="20" />
      </svg>
    ),
  },
  {
    id: "light",
    label: "Light",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1" />
      </svg>
    ),
  },
  {
    id: "dark",
    label: "Dark",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
      </svg>
    ),
  },
];

function resolve(mode: Mode): "light" | "dark" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function apply(mode: Mode) {
  const resolved = resolve(mode);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.themeChoice = mode;
  localStorage.setItem("pi-theme", mode);
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    const stored =
      (localStorage.getItem("pi-theme") as Mode | null) ?? "system";
    setMode(stored);
  }, []);

  const onPick = (m: Mode) => {
    setMode(m);
    apply(m);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center gap-0.5 rounded-full border border-pi-border/80 bg-pi-surface/60 p-0.5 text-pi-muted"
    >
      {OPTIONS.map((o) => {
        const active = mode === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={o.label}
            onClick={() => onPick(o.id)}
            className={
              "relative inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors " +
              (active
                ? "bg-pi-accent/15 text-pi-accent shadow-[0_0_0_1px_rgb(var(--pi-accent)/0.35)]"
                : "hover:text-pi-fg")
            }
          >
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}
