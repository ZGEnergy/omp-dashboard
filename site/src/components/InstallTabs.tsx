import { useEffect, useState } from "preact/hooks";

interface Tab {
  id: string;
  label: string;
  subline: string;
  code: string;
  note?: string;
}

const TABS: Tab[] = [
  {
    id: "electron",
    label: "Electron app",
    subline: "Zero prerequisites. Guided setup wizard.",
    code: "# Download an installer:\n# https://github.com/BlackBeltTechnology/pi-agent-dashboard/releases\n#\n# macOS    — .dmg (arm64 / x64)\n# Linux    — .deb / .AppImage\n# Windows  — .exe / .zip / portable",
    note: "Bundles Node.js, auto-installs pi + openspec. System tray integration.",
  },
  {
    id: "pi",
    label: "pi package",
    subline: "Already using pi? Add it as a package.",
    code: "# From inside any pi session:\n/packages add @blackbelt-technology/pi-dashboard\n\n# That's it. Dashboard auto-starts\n# next time you launch pi.",
  },
  {
    id: "npm",
    label: "npm (CLI)",
    subline: "Classic Node.js install. Runs everywhere.",
    code: "npm install -g @blackbelt-technology/pi-dashboard\n\n# Start the server:\npi-dashboard start\n# or in dev mode:\npi-dashboard start --dev",
    note: "Requires Node.js 20+ and a working pi installation.",
  },
];

function hashToTabId(): string {
  if (typeof window === "undefined") return TABS[0].id;
  const id = window.location.hash.replace(/^#/, "");
  return TABS.some((t) => t.id === id) ? id : TABS[0].id;
}

export default function InstallTabs() {
  const [active, setActive] = useState<string>(TABS[0].id);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setActive(hashToTabId());
    const onHash = () => setActive(hashToTabId());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const current = TABS.find((t) => t.id === active) ?? TABS[0];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Install methods"
        className="flex flex-wrap gap-2 border-b border-pi-border/60"
      >
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => {
                setActive(tab.id);
                if (typeof window !== "undefined") {
                  history.replaceState(null, "", `#${tab.id}`);
                }
              }}
              className={
                "-mb-px px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors border-b-2 " +
                (isActive
                  ? "text-pi-fg border-pi-accent bg-pi-surface/40"
                  : "text-pi-muted border-transparent hover:text-pi-fg hover:bg-pi-surface/20")
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${current.id}`}
        aria-labelledby={`tab-${current.id}`}
        className="pi-gradient-border rounded-b-lg rounded-tr-lg bg-pi-bg/80 p-5 mt-0"
      >
        <div className="text-sm text-pi-muted mb-3">{current.subline}</div>
        <div className="relative rounded-md border border-pi-border/60 bg-pi-bg overflow-hidden">
          <button
            type="button"
            onClick={handleCopy}
            className="absolute right-2 top-2 z-10 rounded-md border border-pi-border/80 bg-pi-surface/80 px-2 py-1 text-[11px] text-pi-muted hover:text-pi-fg hover:border-pi-accent/60 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <pre className="p-4 overflow-x-auto text-sm leading-relaxed font-mono text-slate-200 whitespace-pre">
            {current.code}
          </pre>
        </div>
        {current.note && (
          <p className="mt-3 text-xs text-pi-muted">{current.note}</p>
        )}
      </div>
    </div>
  );
}
