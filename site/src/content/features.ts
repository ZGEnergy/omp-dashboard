export type BadgeTone = "accent" | "success" | "warn";

export interface FeatureEntry {
  id: string;
  title: string;
  blurb: string;
  image?: string;
  imageAlt?: string;
  badge?: string;
  badgeTone?: BadgeTone;
  /** Grid span classes for desktop layout. */
  span?: string;
}

const SHOTS_DESKTOP = "/pi-agent-dashboard/screenshots/desktop";
const SHOTS_MOBILE = "/pi-agent-dashboard/screenshots/mobile";

/**
 * Feature cards laid out as a 12-column bento grid.
 *
 * Layout is tuned so every row adds up to exactly 12 columns with no gaps:
 *
 *   Row 1-2  sessions (8×2)  | chat (4)   / promptbus (4)   stacked
 *   Row 3-4  terminal (4)   / editor (4)   stacked | flows (8×2) banner
 *   Row 5    diff (6)        | mobile (6)
 *   Row 6    openspec (4)    | packages (4) | providers (4)
 *   Row 7    discovery (6)   | tunnel (6)
 *
 * The order here is the DOM order; visual placement is driven by the span
 * classes in each entry's `span` field.
 */
export const FEATURES: FeatureEntry[] = [
  // Row 1-2 — banner + stacked pair
  {
    id: "multi-session",
    title: "Every session, at a glance",
    blurb:
      "See all your pi sessions side-by-side — active, idle, ended — grouped by project folder. The noisy ones get bigger; the quiet ones stay out of the way.",
    image: `${SHOTS_DESKTOP}/sessions.png`,
    imageAlt: "Multi-session dashboard showing several active pi sessions grouped by folder",
    badge: "Realtime",
    badgeTone: "success",
    span: "md:col-span-8 md:row-span-2",
  },
  {
    id: "chat-mirror",
    title: "Live chat mirroring",
    blurb:
      "Every prompt, response, tool call, and streaming token — mirrored to the browser with zero lag. Scroll, fork, resume.",
    image: `${SHOTS_DESKTOP}/chat.png`,
    imageAlt: "Dashboard chat view with a streaming assistant response",
    span: "md:col-span-4",
  },
  {
    id: "promptbus",
    title: "Interactive dialogs, anywhere",
    blurb:
      "PromptBus routes confirm / select / input dialogs to whichever surface answers first — TUI or browser. Survives refresh and server restart.",
    badge: "New",
    badgeTone: "accent",
    span: "md:col-span-4",
  },

  // Row 3-4 — terminal above editor (both col-4) next to the flows banner
  {
    id: "terminal",
    title: "A terminal that just… works",
    blurb:
      "Full xterm.js + node-pty terminal baked into each folder. ANSI colors, scrollback, keep-alive across tab switches.",
    image: `${SHOTS_DESKTOP}/terminal.png`,
    imageAlt: "Integrated browser-based terminal with colorful output",
    span: "md:col-span-4",
  },
  {
    id: "flows",
    title: "Flows in motion",
    blurb:
      "Watch pi-flows execute step by step — agent cards light up, tokens stream, graphs redraw. Abort, auto-run, fork decisions, design new flows, all from the browser.",
    image: `${SHOTS_DESKTOP}/flows.png`,
    imageAlt: "pi-flows live execution dashboard with agent cards and a flow graph",
    badge: "Realtime",
    badgeTone: "success",
    span: "md:col-span-8 md:row-span-2",
  },
  {
    id: "editor",
    title: "VS Code in the browser",
    blurb:
      "An embedded code-server per workspace — explorer, tabs, extensions, git. Lazy-started, proxied through the dashboard. No separate window to babysit.",
    image: `${SHOTS_DESKTOP}/editor.png`,
    imageAlt: "Embedded VS Code / code-server editor inside the dashboard",
    badge: "New",
    badgeTone: "accent",
    span: "md:col-span-4",
  },

  // Row 5 — matched pair
  {
    id: "diff",
    title: "Review every change",
    blurb:
      "Split-pane or unified diff viewer with a file tree of everything the agent touched in this session. Syntax highlighted, copy-friendly.",
    image: `${SHOTS_DESKTOP}/diff.png`,
    imageAlt: "Diff viewer showing file tree and side-by-side diff",
    span: "md:col-span-6",
  },
  {
    id: "mobile",
    title: "Built for the phone in your pocket",
    blurb:
      "Two-panel shell, swipe-back, touch-tuned action menus. Approve a prompt or kill a runaway process from anywhere.",
    image: `${SHOTS_MOBILE}/chat.png`,
    imageAlt: "Mobile chat view with action menu button",
    badge: "Mobile",
    badgeTone: "accent",
    span: "md:col-span-6",
  },

  // Row 6 — triple
  {
    id: "openspec",
    title: "OpenSpec baked in",
    blurb:
      "Browse specs, view archives, manage changes, attach a proposal to a session — all from the sidebar.",
    image: `${SHOTS_DESKTOP}/openspec.png`,
    imageAlt: "OpenSpec change list and archive browser",
    span: "md:col-span-4",
  },
  {
    id: "packages",
    title: "Package manager for pi",
    blurb:
      "Search the npm registry for pi extensions, skills, and themes. Install per-workspace or globally. Sessions auto-reload.",
    image: `${SHOTS_DESKTOP}/packages.png`,
    imageAlt: "Package manager with search results and install buttons",
    span: "md:col-span-4",
  },
  {
    id: "providers",
    title: "One-click provider auth",
    blurb:
      "Sign in to Anthropic, OpenAI Codex, GitHub Copilot, Gemini CLI, and Antigravity through a real OAuth flow. Or drop in an API key.",
    image: `${SHOTS_DESKTOP}/settings-providers.png`,
    imageAlt: "Provider authentication panel in settings",
    span: "md:col-span-4",
  },

  // Row 7 — matched pair (remote delivery)
  {
    id: "discovery",
    title: "Network discovery",
    blurb:
      "mDNS auto-finds every dashboard on your LAN. Pick a server, connect, done. Known servers persist across reloads.",
    span: "md:col-span-6",
  },
  {
    id: "tunnel",
    title: "Go remote with a QR code",
    blurb:
      "One click opens a zrok tunnel with a reserved URL. Scan the QR and your pi agents are on your phone, in a coffee shop, on another continent.",
    image: `${SHOTS_DESKTOP}/tunnel-qr.png`,
    imageAlt: "Tunnel QR code dialog with scannable code",
    badge: "Remote",
    badgeTone: "warn",
    span: "md:col-span-6",
  },
];
