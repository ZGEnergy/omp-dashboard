var nr = Object.defineProperty;
var rr = (e, t, n) => t in e ? nr(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[t] = n;
var N = (e, t, n) => rr(e, typeof t != "symbol" ? t + "" : t, n);
import { BrowserWindow as W, ipcMain as $, app as j, shell as Ae, clipboard as or, Menu as je, dialog as H, screen as sr, nativeImage as nt, Tray as ir, Notification as Bt } from "electron";
import { fileURLToPath as pe, pathToFileURL as kt } from "node:url";
import T, { existsSync as w, realpathSync as xt, readFileSync as R, readdirSync as re, rmSync as se, mkdirSync as V, cpSync as $t, writeFileSync as he, createReadStream as ar, openSync as cr, closeSync as lr, writeSync as ur, appendFileSync as an, statSync as cn, renameSync as Ue } from "node:fs";
import a, { dirname as dr } from "node:path";
import D from "node:os";
import { exec as Ft, execFile as He, execSync as fr, spawnSync as pr, spawn as hr, execFileSync as Et } from "node:child_process";
import { promisify as ln } from "node:util";
import { createRequire as ue } from "node:module";
import { createHash as mr } from "node:crypto";
function gr(e, t) {
  if (!e) return !1;
  let n;
  try {
    n = new URL(t).origin;
  } catch {
    return !1;
  }
  try {
    return new URL(e, t).origin === n;
  } catch {
    return !1;
  }
}
function wr(e, t, n) {
  let r;
  try {
    if (r = new URL(e).origin, !r || r === "null") return "cancel";
  } catch {
    return "cancel";
  }
  let o = null;
  try {
    o = new URL(t).origin;
  } catch {
    o = null;
  }
  return o !== null && o !== r || gr(n, r) ? "allow" : "open-external";
}
function yr(e) {
  return typeof e != "string" ? !1 : e.startsWith("Server did not respond within") || e.startsWith("Server child process exited prematurely");
}
function un(e, t = [], n = process.platform) {
  if (n === "win32") {
    const r = /\.(cmd|bat)$/i.test(e), o = /\.[A-Za-z0-9]+$/.test(e);
    if (r || !o)
      return {
        argv: ["cmd.exe", "/d", "/s", "/c", e, ...t],
        spawnOptions: { shell: !1, windowsHide: !0 }
      };
  }
  return {
    argv: [e, ...t],
    spawnOptions: { shell: !1, windowsHide: !0 }
  };
}
function oe(e) {
  const t = (e == null ? void 0 : e.windowsHide) ?? !0;
  return { ...e ?? {}, windowsHide: t };
}
function Ge(e, t) {
  return fr(e, oe(t));
}
function qe(e, t, n) {
  return pr(e, t ?? [], oe(n));
}
function vr(e, t, n) {
  return typeof t == "function" ? Ft(e, oe(void 0), t) : Ft(e, oe(t), n);
}
function br(e, t, n, r) {
  return typeof n == "function" ? He(e, t ?? [], oe(void 0), n) : He(e, t ?? [], oe(n), r);
}
function me(e, t, n) {
  return hr(e, t ?? [], oe(n));
}
ln(vr);
ln(br);
function Sr(e, t) {
  return Ge(e, { ...t, windowsHide: !0 });
}
function kr(e = {}) {
  const t = e.platform ?? process.platform, n = e.exec ?? Sr;
  try {
    if (t === "darwin") {
      const r = String(n("sysctl -n hw.model", { encoding: "utf-8" })).trim();
      return /VMware|VirtualBox|Parallels/i.test(r);
    }
    if (t === "linux") {
      const r = String(n("systemd-detect-virt 2>/dev/null || echo none", { encoding: "utf-8" })).trim();
      return r !== "none" && r.length > 0;
    }
    if (t === "win32") {
      const r = [
        "wmic bios get serialnumber",
        "wmic computersystem get manufacturer,model"
      ];
      for (const o of r)
        try {
          const s = String(n(o, { encoding: "utf-8", timeout: 5e3 }));
          if (/VMware|VirtualBox|VBOX|Parallels|Virtual Machine|Hyper-V/i.test(s)) return !0;
        } catch {
        }
      return !1;
    }
  } catch {
  }
  return !1;
}
const dn = a.dirname(pe(import.meta.url));
function xr() {
  const e = a.join(dn, "preload.js");
  if (w(e)) return e;
  const t = a.join(process.cwd(), ".vite", "build", "preload.js");
  return w(t) ? t : e;
}
let De = null;
function Pe(e) {
  return new Promise((t) => {
    De = new W({
      width: 640,
      height: 520,
      resizable: !1,
      titleBarStyle: "hiddenInset",
      webPreferences: {
        nodeIntegration: !1,
        contextIsolation: !0,
        preload: xr()
      }
    });
    let n = a.join(dn, "..", "renderer", "wizard.html");
    !w(n) && process.resourcesPath && (n = a.join(process.resourcesPath, "renderer", "wizard.html")), De.loadFile(n, void 0), De.on("closed", () => {
      De = null, t();
    });
  });
}
function $r() {
  return De;
}
class le extends Error {
  constructor(n) {
    super(`Unknown tool: ${n}`);
    N(this, "tool");
    this.name = "UnknownToolError", this.tool = n;
  }
}
class fn extends Error {
  constructor(n) {
    const r = n.tried.map((o) => `  - ${o.strategy}: ${o.result}`).join(`
`);
    super(
      `Could not resolve module "${n.name}". Tried:
${r}`
    );
    N(this, "resolution");
    this.name = "ModuleResolutionError", this.resolution = n;
  }
}
function pn() {
  return a.join(D.homedir(), ".pi", "dashboard", "tool-overrides.json");
}
class hn {
  constructor(t = {}) {
    N(this, "filePath");
    N(this, "warn");
    N(this, "cache", null);
    this.filePath = t.filePath ?? pn(), this.warn = t.warn ?? ((n) => console.warn(`[tool-registry] ${n}`));
  }
  /** Snapshot of current overrides. Lazy-loads from disk on first call. */
  list() {
    return this.cache === null && (this.cache = this.load()), this.cache;
  }
  /** Set one override + persist. */
  set(t, n) {
    const r = this.cache ?? this.load();
    r[t] = n, this.cache = r, this.persist(r);
  }
  /** Remove one override + persist. No-op if absent. */
  clear(t) {
    const n = this.cache ?? this.load();
    t in n && (delete n[t], this.cache = n, this.persist(n));
  }
  /** Drop the in-memory cache; next `list()` re-reads the file. */
  invalidate() {
    this.cache = null;
  }
  // ── Internal ─────────────────────────────────────────────────────────
  load() {
    try {
      if (!T.existsSync(this.filePath)) return {};
      const t = T.readFileSync(this.filePath, "utf-8");
      if (!t.trim()) return {};
      const n = JSON.parse(t);
      if (!n || typeof n != "object" || !n.overrides)
        return this.warn(`malformed overrides file at ${this.filePath}; ignoring`), {};
      const r = {};
      for (const [o, s] of Object.entries(n.overrides))
        s && typeof s == "object" && typeof s.path == "string" && (r[o] = s.path);
      return r;
    } catch (t) {
      return this.warn(
        `failed to read overrides file at ${this.filePath}: ${t instanceof Error ? t.message : String(t)}`
      ), {};
    }
  }
  persist(t) {
    const n = a.dirname(this.filePath);
    T.mkdirSync(n, { recursive: !0 });
    const r = {
      version: 1,
      overrides: Object.fromEntries(
        Object.entries(t).map(([s, i]) => [s, { path: i }])
      )
    }, o = this.filePath + ".tmp";
    T.writeFileSync(o, JSON.stringify(r, null, 2) + `
`), T.renameSync(o, this.filePath);
  }
}
const Er = (e) => {
  switch (e) {
    case "override":
      return "override";
    case "managed":
      return "managed";
    case "bare-import":
      return "bare-import";
    case "npm-global":
      return "npm-global";
    default:
      return "system";
  }
};
class mn {
  constructor(t = {}) {
    N(this, "definitions", /* @__PURE__ */ new Map());
    N(this, "cache", /* @__PURE__ */ new Map());
    N(this, "moduleCache", /* @__PURE__ */ new Map());
    N(this, "overrides");
    N(this, "platform");
    N(this, "importModule");
    N(this, "now");
    N(this, "env");
    this.overrides = t.overrides ?? new hn(), this.platform = t.platform ?? process.platform, this.importModule = t.importModule ?? ((n) => import(
      /* @vite-ignore */
      n
    )), this.now = t.now ?? (() => Date.now()), this.env = t.env;
  }
  /**
   * Platform the registry was created for (or the current runtime's
   * `process.platform`). Exposed so platform-conditional tool registration
   * (e.g. skip `ps`/`pgrep` on Windows) in `registerDefaultTools` honours
   * the test's injected platform instead of always reading the host.
   */
  getPlatform() {
    return this.platform;
  }
  /** Register a tool definition. Last registration wins (tests re-register). */
  register(t) {
    this.definitions.set(t.name, t), this.cache.delete(t.name), this.moduleCache.delete(t.name);
  }
  /** True when the name has a registered definition. */
  has(t) {
    return this.definitions.has(t);
  }
  /** Snapshot of every registered tool's resolution. Triggers resolution as needed. */
  list() {
    return Array.from(this.definitions.keys()).map((t) => this.resolve(t));
  }
  /** Resolve a binary/directory/module-path. Uses cached result when present. */
  resolve(t) {
    var f;
    const n = this.definitions.get(t);
    if (!n) throw new le(t);
    const r = this.cache.get(t);
    if (r) return r;
    const o = {
      overrides: this.overrides.list(),
      platform: this.platform,
      env: this.env
    }, s = [];
    let i = null;
    const c = ((f = n.platformStrategies) == null ? void 0 : f[this.platform]) ?? n.strategies;
    for (const u of c) {
      const p = u.run(o);
      if (!p.ok) {
        s.push({ strategy: u.name, result: p.reason });
        continue;
      }
      if (n.validate) {
        const y = n.validate(p.path);
        if (!y.ok) {
          s.push({ strategy: u.name, result: `invalid: ${y.reason}` });
          continue;
        }
      }
      s.push({ strategy: u.name, result: "ok" }), i = { strategy: u.name, path: p.path };
      break;
    }
    const d = n.classify ?? Er, l = i ? {
      name: t,
      ok: !0,
      path: i.path,
      source: d(i.strategy),
      tried: s,
      resolvedAt: this.now()
    } : {
      name: t,
      ok: !1,
      path: null,
      source: null,
      tried: s,
      resolvedAt: this.now()
    };
    return this.cache.set(t, l), l;
  }
  /**
   * Resolve a tool and return its spawn-ready argv.
   *
   * Uses `resolve()` to find the artifact path, then applies the
   * definition's `toArgv` transform (if any) to produce argv. Default:
   * `argv = [path]` — appropriate for binary-kind tools resolved to an
   * absolute path on PATH.
   *
   * For executor-kind tools with platform-specific interpreter needs
   * (e.g. pi on Windows → `[node.exe, cli.js]`), `toArgv` does the
   * assembly. `toArgv` may call `this.resolve(peer)` to find peer
   * tools (e.g. `node`) and MUST fall back to `[path]` if peers are
   * missing.
   *
   * Callers spawn via `spawn(argv[0], [...argv.slice(1), ...userArgs])`.
   *
   * See change: consolidate-windows-spawn-and-platform-handlers.
   */
  resolveExecutor(t) {
    const n = this.definitions.get(t);
    if (!n) throw new le(t);
    const r = this.resolve(t);
    if (!r.ok || !r.path)
      return { ...r, argv: [] };
    const o = n.toArgv ? n.toArgv(r.path, { platform: this.platform, registry: this }) : [r.path];
    return { ...r, argv: o };
  }
  /**
   * Resolve AND dynamically import a registered module-kind tool.
   * Throws `ModuleResolutionError` with the full `tried[]` trail when
   * every strategy fails. The loaded ES module is cached alongside the
   * Resolution; `rescan(name)` invalidates both.
   */
  async resolveModule(t) {
    const n = this.definitions.get(t);
    if (!n) throw new le(t);
    if (n.kind !== "module")
      throw new Error(`Tool "${t}" is not kind: "module"; use resolve() instead.`);
    const r = this.resolve(t);
    if (!r.ok || !r.path)
      throw new fn(r);
    const o = this.moduleCache.get(t);
    if (o) return { resolution: r, module: o };
    const s = kt(r.path).href, i = await this.importModule(s);
    return this.moduleCache.set(t, i), { resolution: r, module: i };
  }
  /** Drop cached Resolution(s). Next resolve() re-runs strategies. */
  rescan(t) {
    if (t === void 0) {
      this.cache.clear(), this.moduleCache.clear(), this.overrides.invalidate();
      return;
    }
    this.cache.delete(t), this.moduleCache.delete(t);
  }
  /** Set a path override. Invalidates the target's cache. */
  setOverride(t, n) {
    if (!this.definitions.has(t)) throw new le(t);
    this.overrides.set(t, n), this.cache.delete(t), this.moduleCache.delete(t);
  }
  /** Clear a path override. Invalidates the target's cache. */
  clearOverride(t) {
    if (!this.definitions.has(t)) throw new le(t);
    this.overrides.clear(t), this.cache.delete(t), this.moduleCache.delete(t);
  }
}
function ge(e) {
  return a.join((e == null ? void 0 : e.homedir) ?? D.homedir(), ".pi-dashboard");
}
function gn(e) {
  return a.join(ge(e), "node_modules", ".bin");
}
function jr(e) {
  return a.join(D.homedir(), ".pi", "agent", "settings.json");
}
const zt = ge(), rt = gn();
jr();
const Dr = [
  "@earendil-works/pi-coding-agent",
  "@mariozechner/pi-coding-agent"
], Pr = ["jiti", "@mariozechner/jiti"];
function Ar(e) {
  if (/^[A-Za-z]:[\\/]/.test(e))
    return `file:///${a.win32.join(
      a.win32.dirname(e),
      "lib",
      "jiti-register.mjs"
    ).replace(/\\/g, "/")}`;
  const n = a.join(a.dirname(e), "lib", "jiti-register.mjs");
  return kt(n).href;
}
function ve(e, t) {
  for (const n of Pr)
    try {
      const r = e(`${n}/package.json`);
      if (t) {
        const o = a.join(a.dirname(r), "lib", "jiti-register.mjs");
        if (!t(o)) continue;
      }
      return Ar(r);
    } catch {
    }
  return null;
}
function _e(e) {
  try {
    return xt(e);
  } catch {
    return e;
  }
}
function wn(e, t) {
  if (!e) return !1;
  const n = process.execPath, r = process.env.APPDIR, o = process.env.APPIMAGE, s = _e(e);
  if (n) {
    const i = _e(n);
    if (s === i || e === n) return !0;
  }
  if (r) {
    const i = _e(r), c = a.sep, d = i.endsWith(c) ? i : i + c;
    if (s === i || s.startsWith(d)) return !0;
    const l = r.endsWith(c) ? r : r + c;
    if (e === r || e.startsWith(l)) return !0;
  }
  if (o) {
    const i = _e(o);
    if (s === i || e === o) return !0;
  }
  return !1;
}
const Rr = Symbol.for("pi-dashboard.tool-registry");
function Nr() {
  return globalThis[Rr] ?? null;
}
class G {
  constructor(t = {}) {
    N(this, "ctx");
    this.ctx = t;
  }
  /**
   * Resolve a binary by name. Returns absolute path or null.
   * Search order: managed bin → extra dirs → system PATH → login shell.
   */
  which(t) {
    const n = process.platform === "win32" ? ".cmd" : "", r = a.join(rt, t + n);
    if (w(r)) return r;
    for (const s of this.ctx.extraBinDirs ?? []) {
      const i = a.join(s, t + n);
      if (w(i)) return i;
    }
    const o = _r(t);
    return o || (this.ctx.useLoginShell && process.platform !== "win32" ? Or(t) : null);
  }
  /**
   * Resolve pi as spawn-ready argv `[cmd, ...prefixArgs]`.
   *
   * Fully delegates to `ToolRegistry.resolveExecutor("pi")`, which
   * owns per-OS discovery + interpreter assembly (on Windows: find
   * `pi-coding-agent/dist/cli.js` via managed/bare-import/npm-global
   * and prepend `node.exe`; on Unix: find `pi` binary on PATH).
   *
   * Returns null when the registry is not yet constructed AND pi is
   * not on PATH (very early boot / standalone tests). Production code
   * always has the registry available before spawn.
   */
  resolvePi() {
    const t = Nr();
    if (t != null && t.has("pi")) {
      const r = t.resolveExecutor("pi");
      if (r.ok && r.argv.length > 0) return r.argv;
    }
    const n = this.which("pi");
    return n ? [n] : null;
  }
  /**
   * Resolve tsx as [cmd, ...prefixArgs].
   * On Windows, avoids .cmd by returning [node.exe, tsx/dist/cli.mjs].
   */
  resolveTsx() {
    if (process.platform === "win32") {
      const n = a.join(zt, "node_modules", "tsx", "dist", "cli.mjs");
      if (w(n)) {
        const r = this.resolveNode();
        if (r) return [r, n];
      }
    }
    const t = this.which("tsx");
    return t ? [t] : null;
  }
  /**
   * Resolve Node.js binary path.
   * Checks processExecPath, extra dirs, managed, system PATH, login shell.
   */
  resolveNode() {
    if (this.ctx.processExecPath)
      return this.ctx.processExecPath;
    for (const t of this.ctx.extraBinDirs ?? []) {
      const n = process.platform === "win32" ? "node.exe" : "node", r = a.join(t, n);
      if (w(r)) return r;
    }
    return this.which("node");
  }
  /**
   * Resolve pi's jiti register hook as a `file://` URL.
   *
   * Resolution order (first hit wins):
   *   1. Managed pi install — `~/.pi-dashboard/node_modules/<pkg>` for
   *      every entry of `MANAGED_PI_PACKAGES` (upstream first, legacy
   *      fallback). Each candidate's pkg.json is the createRequire
   *      anchor; walk `JITI_PACKAGES` from there.
   *   2. System pi via `this.which("pi")` (realpathed to escape
   *      symlinks like `/usr/local/bin/pi → .../dist/cli.js`).
   *   3. Caller-supplied `opts.anchor` (e.g. an electron `cliPath`).
   *   4. `process.argv[1]` (the running pi/node entry; populated for
   *      bridge-extension callers).
   *
   * Returns null when none yield a jiti install. Preserves the
   * Windows drive-letter URL-wrapping contract that previously lived
   * on the prior `buildJitiRegisterUrl` helper in `resolve-jiti.ts`.
   *
   * Tests inject `_pathExists` / `_realpath` / `_whichPi` / `_argv1`
   * / `_managedDir` and a flat `resolver` to exercise individual
   * anchors deterministically.
   *
   * Subsumes the previous `resolveJitiImport`, `resolveJitiFromAnchor`,
   * `pickJitiRegisterUrl`, `pickJitiFromAnchor`, `buildJitiRegisterUrl`,
   * and the duplicate `resolveJitiFromPi` wrappers in electron.
   */
  resolveJiti(t = {}) {
    const n = t._pathExists ?? w, r = t._realpath ?? xt, o = t._whichPi ?? (() => this.which("pi")), s = "_argv1" in t ? t._argv1 : process.argv[1], i = t._managedDir ?? zt, c = (l) => {
      if (t.resolver) return t.resolver;
      try {
        const f = ue(l);
        return (u) => f.resolve(u);
      } catch {
        return null;
      }
    };
    if (t.anchorOnly) {
      if (!t.anchor || !n(t.anchor)) return null;
      const l = c(t.anchor);
      return l ? ve(l, n) : null;
    }
    for (const l of Dr) {
      const f = a.join(i, "node_modules", l, "package.json");
      if (!n(f)) continue;
      const u = c(f);
      if (!u) continue;
      const p = ve(u, n);
      if (p) return p;
    }
    const d = o();
    if (d) {
      let l;
      try {
        l = r(d);
      } catch {
        l = d;
      }
      const f = c(l);
      if (f) {
        const u = ve(f, n);
        if (u) return u;
      }
    }
    if (t.anchor && n(t.anchor)) {
      const l = c(t.anchor);
      if (l) {
        const f = ve(l, n);
        if (f) return f;
      }
    }
    if (s) {
      let l;
      try {
        l = r(s);
      } catch {
        l = s;
      }
      const f = c(l);
      if (f) {
        const u = ve(f, n);
        if (u) return u;
      }
    }
    return null;
  }
  /**
   * Build a spawn environment with managed bin, node bin, extra dirs,
   * and common user bin dirs prepended to PATH.
   */
  buildSpawnEnv(t = process.env) {
    const n = /* @__PURE__ */ new Set([
      "ELECTRON_RUN_AS_NODE",
      "ELECTRON_DEFAULT_ERROR_MODE",
      "ELECTRON_ENABLE_STACK_DUMPING"
    ]), r = {};
    for (const [c, d] of Object.entries(t))
      n.has(c) || (r[c] = d);
    t = r;
    const o = t.PATH || "", s = [];
    o.includes(rt) || s.push(rt);
    const i = this.ctx.processExecPath ? a.dirname(this.ctx.processExecPath) : null;
    i && !o.includes(i) && s.push(i);
    for (const c of this.ctx.extraBinDirs ?? [])
      o.includes(c) || s.push(c);
    for (const c of Mr())
      o.includes(c) || s.push(c);
    return s.length === 0 ? t : { ...t, PATH: `${s.join(a.delimiter)}${a.delimiter}${o}` };
  }
}
function Ut(e, t) {
  try {
    const { argv: n, spawnOptions: r } = un(e, [t]), o = qe(n[0], n.slice(1), {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      ...r
    });
    return o.status !== 0 ? [] : (typeof o.stdout == "string" ? o.stdout : String(o.stdout ?? "")).split(/\r?\n/).map((i) => i.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
function Tr(e) {
  const t = Math.max(e.lastIndexOf("\\"), e.lastIndexOf("/")), n = e.lastIndexOf(".");
  return n > t ? e.slice(n).toLowerCase() : "";
}
function _r(e) {
  if (!(process.platform === "win32"))
    return Ut("which", e)[0] ?? null;
  const n = Ut("where", e);
  if (n.length === 0) return null;
  if (/\.[A-Za-z0-9]+$/.test(e)) return n[0];
  const s = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC;.PS1").split(";").map((d) => d.trim().toLowerCase()).filter(Boolean);
  let i = null, c = 1 / 0;
  for (const d of n) {
    const l = s.indexOf(Tr(d));
    l !== -1 && l < c && (i = d, c = l);
  }
  return i || n[0];
}
function Or(e) {
  const t = process.env.SHELL || "/bin/zsh";
  try {
    const n = Ge(`${t} -ilc "which ${e}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5e3,
      windowsHide: !0
    }), o = (typeof n == "string" ? n : String(n)).trim().split(`
`).find((s) => s.trim().startsWith("/"));
    return (o == null ? void 0 : o.trim()) || null;
  } catch {
    return null;
  }
}
function Mr() {
  const e = D.homedir();
  return [
    a.join(e, ".local", "bin"),
    a.join(e, ".npm-global", "bin"),
    "/usr/local/bin"
  ].filter((t) => w(t));
}
function jt(e, t = process.platform) {
  const n = a.join(ge(e), "node");
  return t === "win32" ? n : a.join(n, "bin");
}
function yn(e, t = process.platform) {
  const n = jt(e, t);
  return a.join(n, t === "win32" ? "node.exe" : "node");
}
function vn(e, t = process.platform) {
  return w(yn(e, t));
}
function Ir(e = process.env, t) {
  const n = { ...e };
  if (!vn(t)) return n;
  const r = jt(t), o = n.PATH ?? "";
  return o.split(a.delimiter).includes(r) || (n.PATH = o ? `${r}${a.delimiter}${o}` : r), n;
}
const Cr = new G({
  processExecPath: process.execPath,
  useLoginShell: !0
}), Lr = Symbol.for("pi-dashboard.tool-registry");
function Br() {
  return globalThis[Lr] ?? null;
}
function Fr(e) {
  return !!(a.isAbsolute(e) || e.startsWith("./") || e.startsWith("../") || e.startsWith(".\\") || e.startsWith("..\\"));
}
function zr(e, t) {
  if (Fr(e))
    return w(e) ? [e, ...t] : null;
  const n = Br();
  if (n && n.has(e)) {
    const o = n.resolveExecutor(e);
    return o.ok && o.argv.length > 0 ? [...o.argv, ...t] : null;
  }
  const r = Cr.which(e);
  return r ? [r, ...t] : null;
}
const Ur = 5e3;
function Ne(e, t, n = {}) {
  var p, y;
  const r = e.argv(t);
  if (r.length === 0)
    return { ok: !1, error: { kind: "spawn-failure", message: "Recipe produced empty argv" } };
  const [o, ...s] = r, i = zr(o, s);
  if (!i)
    return { ok: !1, error: { kind: "not-found", binary: o } };
  const c = n.timeout ?? e.timeout ?? Ur, [d, ...l] = i, { argv: f, spawnOptions: u } = un(d, l);
  try {
    const g = qe(f[0], f.slice(1), {
      cwd: n.cwd,
      env: n.env ? { ...process.env, ...n.env } : void 0,
      encoding: "utf-8",
      timeout: c,
      stdio: ["pipe", "pipe", "pipe"],
      ...u
      // shell: false, windowsHide: true
    });
    if (g.error) {
      const S = g.error;
      return S.code === "ETIMEDOUT" || (p = S.message) != null && p.includes("ETIMEDOUT") ? { ok: !1, error: { kind: "timeout", timeoutMs: c, binary: o } } : { ok: !1, error: { kind: "spawn-failure", message: S.message } };
    }
    if (g.status === null && g.signal)
      return { ok: !1, error: { kind: "timeout", timeoutMs: c, binary: o } };
    const v = typeof g.stdout == "string" ? g.stdout : String(g.stdout ?? ""), h = typeof g.stderr == "string" ? g.stderr : String(g.stderr ?? ""), m = g.status, b = m !== 0 && ((y = e.tolerate) == null ? void 0 : y.includes(m ?? -1));
    return m === 0 || b ? { ok: !0, value: e.parse(v, t) } : { ok: !1, error: { kind: "exit", code: m, signal: g.signal, stdout: v, stderr: h } };
  } catch (g) {
    return {
      ok: !1,
      error: { kind: "spawn-failure", message: g instanceof Error ? g.message : String(g) }
    };
  }
}
function Dt(e, t) {
  return e.ok ? e.value : t;
}
const Pt = 1e4, bn = 12e4, Hr = {
  argv: () => ["npm", "root", "-g"],
  parse: (e) => e.trim(),
  timeout: Pt
}, Vr = {
  argv: ({ pkg: e }) => e === void 0 ? ["npm", "outdated", "--json"] : ["npm", "outdated", e, "--json"],
  parse: (e) => {
    const t = e.trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  },
  timeout: Pt,
  tolerate: [1]
}, Jr = {
  argv: ({ pkg: e }) => e === void 0 ? ["npm", "outdated", "-g", "--json"] : ["npm", "outdated", "-g", e, "--json"],
  parse: (e) => {
    const t = e.trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  },
  timeout: Pt,
  tolerate: [1]
}, Wr = {
  argv: ({ pkg: e, version: t }) => ["npm", "install", t ? `${e}@${t}` : e],
  parse: (e) => e,
  timeout: bn
}, Gr = {
  argv: ({ pkg: e, version: t }) => ["npm", "install", "-g", t ? `${e}@${t}` : e],
  parse: (e) => e,
  timeout: bn
};
function qr() {
  return Ne(Hr, {}, {});
}
function Kr(e) {
  return Ne(Vr, e, { cwd: e.cwd });
}
function Yr(e = {}) {
  return Ne(Jr, e, {});
}
function Xr(e) {
  return Ne(Wr, e, { cwd: e.cwd });
}
function Zr(e) {
  return Ne(Gr, e, {});
}
function Qr(e = "") {
  return Dt(qr(), e);
}
function eo(e, t = null) {
  return Dt(Kr(e), t);
}
function to(e = {}, t = null) {
  return Dt(Yr(e), t);
}
function no(e, t) {
  try {
    return ue(t).resolve(e);
  } catch {
    return null;
  }
}
function ro() {
  const e = new G({
    processExecPath: process.execPath,
    useLoginShell: !0
  });
  return {
    exists: w,
    which: (t) => e.which(t),
    npmRootGlobal: () => Qr(""),
    resolveModule: no,
    resourcesPath: () => process.resourcesPath ?? null
  };
}
function Z(e) {
  const t = ro();
  return e ? {
    exists: e.exists ?? t.exists,
    which: e.which ?? t.which,
    npmRootGlobal: e.npmRootGlobal ?? t.npmRootGlobal,
    resolveModule: e.resolveModule ?? t.resolveModule,
    resourcesPath: e.resourcesPath ?? t.resourcesPath
  } : t;
}
function B(e, t) {
  const { exists: n } = Z(t);
  return {
    name: "override",
    run(r) {
      const o = r.overrides[e];
      return o ? n(o) ? { ok: !0, path: o } : { ok: !1, reason: `invalid: path does not exist: ${o}` } : { ok: !1, reason: "no override set" };
    }
  };
}
function At(e, t) {
  const { exists: n } = Z(t);
  return {
    name: "managed",
    run(r) {
      const o = jt(r.env, r.platform), s = r.platform === "win32", i = e === "node" ? s ? "node.exe" : "node" : s ? `${e}.cmd` : e, c = a.join(o, i);
      return n(c) ? { ok: !0, path: c } : { ok: !1, reason: `missing: ${c}` };
    }
  };
}
function Rt(e, t) {
  const { exists: n, resourcesPath: r } = Z(t);
  return {
    name: "electron-bundled",
    run(o) {
      const s = r();
      if (!s)
        return {
          ok: !1,
          reason: "not running in Electron (no resourcesPath)"
        };
      const i = o.platform === "win32", c = [];
      e === "node" ? c.push(
        i ? a.join(s, "node", "node.exe") : a.join(s, "node", "bin", "node")
      ) : c.push(
        i ? a.join(s, "node", "node_modules", "npm", "bin", "npm-cli.js") : a.join(s, "node", "lib", "node_modules", "npm", "bin", "npm-cli.js")
      );
      for (const d of c)
        if (n(d)) return { ok: !0, path: d };
      return { ok: !1, reason: `missing: ${c[0]}` };
    }
  };
}
function de(e, t) {
  const { exists: n } = Z(t);
  return {
    name: "managed",
    run(r) {
      const o = r.platform === "win32" ? ".cmd" : "", s = a.join(gn(r.env), e + o);
      return n(s) ? { ok: !0, path: s } : { ok: !1, reason: `missing: ${s}` };
    }
  };
}
function Te(e, t = a.join("dist", "index.js"), n) {
  const { exists: r } = Z(n);
  return {
    name: "managed",
    run(o) {
      const s = a.join(ge(o.env), "node_modules", e, t);
      return r(s) ? { ok: !0, path: s } : { ok: !1, reason: `missing: ${s}` };
    }
  };
}
function Ke(e, t = a.join("dist", "index.js"), n) {
  const { exists: r, npmRootGlobal: o } = Z(n);
  return {
    name: "npm-global",
    run() {
      const s = o();
      if (!s) return { ok: !1, reason: "npm root -g failed" };
      const i = a.join(s, e, t);
      return r(i) ? { ok: !0, path: i } : { ok: !1, reason: `missing: ${i}` };
    }
  };
}
function q(e, t) {
  const { which: n } = Z(t);
  return {
    name: "where",
    run() {
      const r = n(e);
      return r ? wn(r) ? { ok: !1, reason: `appimage-self-hit: ${r}` } : { ok: !0, path: r } : { ok: !1, reason: "not found on PATH" };
    }
  };
}
function Sn(e, t = import.meta.url, n) {
  const { resolveModule: r } = Z(n);
  return {
    name: "bare-import",
    run() {
      const o = r(e, t);
      return o ? { ok: !0, path: o } : { ok: !1, reason: `cannot resolve ${e} from ${t}` };
    }
  };
}
function ie(e) {
  return e === "override" ? "override" : e === "managed" || e === "electron-bundled" ? "managed" : e === "npm-global" ? "npm-global" : e === "bare-import" ? "bare-import" : "system";
}
function F(e, t) {
  const n = e === "node", r = [
    B(e, t),
    ...n ? [
      At("node", t),
      Rt("node", t)
    ] : [],
    de(e, t),
    q(e, t)
  ];
  return {
    name: e,
    kind: "binary",
    strategies: r,
    classify: ie
  };
}
function Ht(e, t, n, r) {
  const o = [B(e, r)];
  for (const s of t) o.push(Sn(s));
  for (const s of t) o.push(Te(s, n, r));
  for (const s of t) o.push(Ke(s, n, r));
  return { name: e, kind: "module", strategies: o, classify: ie };
}
function oo(e, t, n) {
  const o = (s, i) => {
    try {
      return t && t.length > 0 ? ue(i).resolve(s, { paths: t }) : ue(i).resolve(s);
    } catch {
      return null;
    }
  };
  return {
    name: "bare-import",
    run() {
      const s = o(`${e}/package.json`, import.meta.url);
      return s ? { ok: !0, path: a.dirname(s) } : { ok: !1, reason: `cannot resolve ${e}/package.json` };
    }
  };
}
function Vt(e, t, n, r) {
  const o = [
    B(e, r),
    oo(t, n.searchPaths)
  ];
  return n.includeManaged && o.push(Te(t, "package.json", r)), { name: e, kind: "module", strategies: o, classify: ie };
}
const Nt = (e, { platform: t, registry: n }) => {
  if (/\.js$/i.test(e)) {
    const r = n.resolve("node");
    if (r.ok && r.path) return [r.path, e];
  }
  return [e];
};
function so(e) {
  const t = ["@earendil-works/pi-coding-agent", "@mariozechner/pi-coding-agent"], n = a.join("dist", "cli.js"), r = [
    B("pi", e),
    ...t.map((s) => kn(s, n)),
    ...t.map((s) => Te(s, n, e)),
    ...t.map((s) => Ke(s, n, e)),
    de("pi", e),
    q("pi", e)
  ];
  return {
    name: "pi",
    kind: "executor",
    strategies: [
      B("pi", e),
      de("pi", e),
      q("pi", e)
    ],
    platformStrategies: { win32: r },
    toArgv: Nt,
    classify: ie
  };
}
function io(e) {
  const t = "@fission-ai/openspec", n = a.join("bin", "openspec.js"), r = [
    B("openspec", e),
    kn(t, n),
    Te(t, n, e),
    Ke(t, n, e),
    de("openspec", e),
    q("openspec", e)
  ];
  return {
    name: "openspec",
    kind: "executor",
    strategies: [
      B("openspec", e),
      de("openspec", e),
      q("openspec", e)
    ],
    platformStrategies: { win32: r },
    toArgv: Nt,
    classify: ie
  };
}
function ao(e) {
  const t = a.join("node_modules", "npm", "bin", "npm-cli.js"), n = {
    name: "managed",
    // classified as managed because it ships with node
    run() {
      const c = process.execPath;
      if (!c) return { ok: !1, reason: "process.execPath unset" };
      const d = a.dirname(c), l = a.join(d, t);
      try {
        return w(l) ? { ok: !0, path: l } : { ok: !1, reason: `missing: ${l}` };
      } catch (f) {
        return { ok: !1, reason: f instanceof Error ? f.message : String(f) };
      }
    }
  }, r = At("npm", e), o = Rt("npm", e), s = [
    B("npm", e),
    r,
    o,
    n,
    q("npm", e)
  ];
  return {
    name: "npm",
    kind: "executor",
    strategies: [
      B("npm", e),
      r,
      o,
      q("npm", e)
    ],
    platformStrategies: { win32: s },
    toArgv: Nt,
    classify: ie
  };
}
function kn(e, t, n) {
  const r = ((o, s) => {
    try {
      return ue(s).resolve(o);
    } catch {
      return null;
    }
  });
  return {
    name: "bare-import",
    run() {
      const o = r(`${e}/package.json`, import.meta.url);
      return o ? { ok: !0, path: a.join(a.dirname(o), t) } : { ok: !1, reason: `cannot resolve ${e}/package.json` };
    }
  };
}
function xn(e, t) {
  e.register(so(t)), e.register(io(t)), e.register(ao(t)), e.register(F("node", t)), e.register(F("git", t)), e.register(F("jj", t)), e.register(F("zrok", t)), e.getPlatform() === "win32" ? (e.register(F("wmic", t)), e.register(F("powershell", t)), e.register(F("tasklist", t)), e.register(F("taskkill", t))) : (e.register(F("ps", t)), e.register(F("pgrep", t))), e.register({
    name: "wt",
    kind: "binary",
    strategies: [
      B("wt", t),
      q("wt", t)
    ],
    classify: ie
  }), e.register(
    Ht(
      "pi-coding-agent",
      ["@earendil-works/pi-coding-agent", "@mariozechner/pi-coding-agent"],
      a.join("dist", "index.js"),
      t
    )
  ), e.register(
    Ht(
      "pi-ai",
      ["@earendil-works/pi-ai", "@mariozechner/pi-ai"],
      a.join("dist", "index.js"),
      t
    )
  ), e.register(
    Vt(
      "electron",
      "electron",
      {
        searchPaths: [a.resolve("packages/electron")],
        includeManaged: !0
      },
      t
    )
  ), e.register(
    Vt(
      "node-pty",
      "node-pty",
      { includeManaged: !1 },
      t
    )
  );
}
const co = Symbol.for("pi-dashboard.tool-registry");
let be = null;
function Ye() {
  return be || (be = new mn(), xn(be), globalThis[co] = be), be;
}
const lo = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ModuleResolutionError: fn,
  OverridesStore: hn,
  ToolRegistry: mn,
  UnknownToolError: le,
  bareImportStrategy: Sn,
  defaultOverridesPath: pn,
  electronBundledRuntimeStrategy: Rt,
  getDefaultRegistry: Ye,
  managedBinStrategy: de,
  managedModuleStrategy: Te,
  managedRuntimeStrategy: At,
  npmGlobalStrategy: Ke,
  overrideStrategy: B,
  registerDefaultTools: xn,
  whereStrategy: q
}, Symbol.toStringTag, { value: "Module" })), E = a.join(D.homedir(), ".pi-dashboard");
a.join(E, "node_modules", ".bin");
a.join(D.homedir(), ".pi", "agent", "settings.json");
const uo = new G({ processExecPath: process.execPath, useLoginShell: !0 });
function fo(e) {
  if (!e.ok || !e.path)
    return { found: !1, resolution: e };
  const t = e.source === "managed" ? "managed" : "system";
  return { found: !0, path: e.path, source: t, resolution: e };
}
function Tt(e) {
  const t = Ye();
  if (!t.has(e)) return { found: !1 };
  const n = fo(t.resolve(e));
  return n.found && n.path && wn(n.path) ? { found: !1, resolution: n.resolution } : n;
}
function Xe() {
  return Tt("pi");
}
function $n() {
  return Tt("openspec");
}
function ne() {
  const e = Tt("node");
  if (e.found && e.path)
    try {
      const n = Ge(`"${e.path}" --version`, { encoding: "utf-8" }).trim(), r = n.match(/^v(\d+)\.(\d+)/);
      if (r) {
        const o = parseInt(r[1], 10), s = parseInt(r[2], 10);
        if ((o > 20 || o === 20 && s >= 6) && !En(n))
          return e;
      }
    } catch {
    }
  const t = po();
  return t ? { found: !0, path: t, source: "system" } : { found: !1, resolution: e.resolution };
}
function En(e) {
  const t = e.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!t) return !1;
  const n = Number(t[1]), r = Number(t[2]);
  return n === 22 && r < 18 || n === 24 && r >= 1 && r < 3;
}
function po() {
  if (process.platform === "win32") return null;
  const e = D.homedir(), t = [], n = a.join(e, ".nvm", "versions", "node");
  if (w(n))
    try {
      const r = re(n).filter((o) => /^v?\d+\.\d+\.\d+/.test(o)).sort((o, s) => ho(o, s));
      for (const o of r)
        t.push(a.join(n, o, "bin", "node"));
    } catch {
    }
  t.push(
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    a.join(e, ".volta", "bin", "node"),
    "/usr/bin/node"
  );
  for (const r of t)
    if (w(r))
      try {
        const o = Et(r, ["--version"], { encoding: "utf8", timeout: 5e3 }).trim(), s = o.match(/^v(\d+)\.(\d+)/);
        if (!s) continue;
        const i = Number(s[1]), c = Number(s[2]);
        if (i < 20 || i === 20 && c < 6 || En(o)) continue;
        return r;
      } catch {
      }
  return null;
}
function ho(e, t) {
  const n = e.replace(/^v/, "").split(".").map((o) => parseInt(o, 10)), r = t.replace(/^v/, "").split(".").map((o) => parseInt(o, 10));
  for (let o = 0; o < 3; o++) {
    const s = n[o] ?? 0, i = r[o] ?? 0;
    if (s !== i) return i - s;
  }
  return 0;
}
function jn() {
  const e = "@blackbelt-technology/pi-agent-dashboard", t = a.join(E, "node_modules", e, "package.json");
  if (w(t))
    return { found: !0, path: t, source: "managed" };
  try {
    const n = uo.which("npm");
    if (!n) return { found: !1 };
    const r = a.join(a.dirname(a.dirname(n)), "node_modules", e, "package.json");
    if (w(r))
      return { found: !0, path: r, source: "system" };
  } catch {
  }
  return { found: !1 };
}
function mo() {
  const e = a.join(D.homedir(), ".pi", "agent", "settings.json");
  try {
    if (w(e)) {
      const t = R(e, "utf-8").trim();
      if (t) {
        const n = JSON.parse(t), r = Array.isArray(n == null ? void 0 : n.packages) ? n.packages : [];
        for (const o of r)
          if (typeof o == "string" && (o.includes("pi-dashboard") || o.includes("pi-agent-dashboard")))
            return { found: !0, path: o, source: "settings" };
      }
    }
  } catch {
  }
  return jn();
}
const go = a.dirname(pe(import.meta.url));
function _t() {
  return process.resourcesPath ? process.resourcesPath : a.resolve(go, "..", "..", "..", "..", "resources");
}
function K() {
  const e = _t();
  if (process.platform === "win32") {
    const n = a.join(e, "node", "node.exe");
    return w(n) ? n : null;
  }
  const t = a.join(e, "node", "bin", "node");
  return w(t) ? t : null;
}
function wo() {
  return K() ? a.join(_t(), "node") : null;
}
function Dn() {
  const e = _t();
  return [
    a.join(e, "node", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    a.join(e, "node", "node_modules", "npm", "bin", "npm-cli.js")
  ].find((n) => w(n)) ?? null;
}
function yo(e) {
  V(e, { recursive: !0 });
  const t = a.join(e, "package.json");
  w(t) || he(
    t,
    JSON.stringify({ name: "pi-dashboard-managed", private: !0, type: "module" }, null, 2)
  );
}
function vo(e) {
  if (e.npmArgv && e.npmArgv.length > 0) return [...e.npmArgv];
  const t = e.registry ?? Ye();
  if (t.has("npm")) {
    const r = t.resolve("npm");
    if (r.ok && r.path) return [r.path];
  }
  return [process.platform === "win32" ? "npm.cmd" : "npm"];
}
function bo(e, t, n, r, o) {
  return new Promise((s, i) => {
    var y, g;
    const [c, ...d] = e;
    if (!c) {
      i(new Error("resolveNpmArgv returned an empty argv"));
      return;
    }
    const l = [...d, "install", ...t], f = me(c, l, {
      cwd: n,
      env: r,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 3e5
    });
    let u = "";
    const p = (v) => {
      const h = v.toString();
      u += h, u.length > 4096 && (u = u.slice(-4096));
      const m = h.split(`
`).filter((S) => S.trim()), b = m[m.length - 1];
      b && o && o(b.trim().substring(0, 120));
    };
    (y = f.stdout) == null || y.on("data", p), (g = f.stderr) == null || g.on("data", p), f.on("error", (v) => i(new Error(v.message))), f.on("close", (v) => {
      v !== 0 ? i(new Error(u.slice(-500) || `npm install exited with code ${v}`)) : s();
    });
  });
}
async function So(e) {
  var s, i, c;
  const t = e.managedDir ?? ge();
  yo(t);
  const n = vo(e), r = { ...process.env, ...e.env ?? {} }, o = [];
  for (const d of e.packages) {
    const l = d.split("/").pop() || d;
    (s = e.progress) == null || s.call(e, { step: l, status: "running" });
    try {
      await bo(n, [d], t, r, (f) => {
        var u;
        (u = e.progress) == null || u.call(e, { step: l, status: "running", output: f });
      }), (i = e.progress) == null || i.call(e, { step: l, status: "done" }), o.push(d);
    } catch (f) {
      const u = f instanceof Error ? f.message : String(f);
      return (c = e.progress) == null || c.call(e, { step: l, status: "error", error: u }), { ok: !1, error: u, installed: o, managedDir: t };
    }
  }
  return { ok: !0, installed: o, managedDir: t };
}
function ko(e) {
  return process.platform === "win32" ? a.join(e, "node.exe") : a.join(e, "bin", "node");
}
function xo(e) {
  if (!w(e)) return null;
  try {
    const t = qe(e, ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5e3,
      encoding: "utf-8"
    });
    return t.status !== 0 ? null : (t.stdout ?? "").toString().trim() || null;
  } catch {
    return null;
  }
}
function $o(e) {
  const t = a.join(e, ".version");
  if (!w(t)) return null;
  try {
    return R(t, "utf-8").trim() || null;
  } catch {
    return null;
  }
}
async function Ot(e = {}) {
  var d, l, f;
  const t = e.managedDir ?? ge(), n = a.join(t, "node"), r = "node-runtime", o = e.bundledNodeDir ?? null;
  if (!o)
    return {
      ok: !0,
      copied: !1,
      managedNodeDir: n,
      reason: "no bundled source"
    };
  const s = ko(o), i = (e._readVersion ?? xo)(s);
  if (!i)
    return {
      ok: !0,
      copied: !1,
      managedNodeDir: n,
      reason: `bundled node binary missing or unreadable: ${s}`
    };
  if ($o(n) === i)
    return {
      ok: !0,
      copied: !1,
      managedNodeDir: n,
      version: i,
      reason: "version matches bundled — no copy needed"
    };
  (d = e.progress) == null || d.call(e, {
    step: r,
    status: "running",
    output: `Installing Node ${i} runtime`
  });
  try {
    return w(n) && se(n, { recursive: !0, force: !0 }), V(a.dirname(n), { recursive: !0 }), $t(o, n, {
      recursive: !0,
      force: !0
      // dereference: false keeps symlinks-as-symlinks (Unix npm shim).
      // verbatimSymlinks would also work in newer Node; default is fine.
    }), he(
      a.join(n, ".version"),
      i + `
`,
      "utf-8"
    ), (l = e.progress) == null || l.call(e, { step: r, status: "done", output: `Node ${i}` }), {
      ok: !0,
      copied: !0,
      managedNodeDir: n,
      version: i
    };
  } catch (u) {
    const p = u instanceof Error ? u.message : String(u);
    return (f = e.progress) == null || f.call(e, { step: r, status: "error", error: p }), {
      ok: !1,
      copied: !1,
      managedNodeDir: n,
      version: i,
      error: p
    };
  }
}
function Pn(e) {
  const t = a.join(e, "offline-packages"), n = a.join(t, "manifest.json");
  if (!w(n))
    return { present: !1, reason: `manifest not found at ${n}` };
  let r;
  try {
    r = R(n, "utf-8");
  } catch (i) {
    return { present: !1, reason: `cannot read manifest: ${(i == null ? void 0 : i.message) ?? i}` };
  }
  let o;
  try {
    o = Eo(r);
  } catch (i) {
    return { present: !1, reason: `invalid manifest: ${(i == null ? void 0 : i.message) ?? i}` };
  }
  const s = a.join(t, o.tarball);
  return w(s) ? { present: !0, manifest: o, tarballPath: s, manifestPath: n } : { present: !1, reason: `tarball not found at ${s}` };
}
function Eo(e) {
  const t = JSON.parse(e);
  if (!t || typeof t != "object") throw new Error("not an object");
  const n = ["bundledAt", "targetPlatform", "tarball", "sha256"];
  for (const r of n)
    if (typeof t[r] != "string" || !t[r])
      throw new Error(`missing/invalid "${r}"`);
  if (typeof t.tarballBytes != "number" || t.tarballBytes <= 0)
    throw new Error('missing/invalid "tarballBytes"');
  if (!Array.isArray(t.packages) || t.packages.length === 0)
    throw new Error('"packages" must be a non-empty array');
  for (const r of t.packages)
    if (!r || typeof r.name != "string" || typeof r.version != "string")
      throw new Error("package entry missing name/version");
  if (!/^[0-9a-f]{64}$/i.test(t.sha256))
    throw new Error("sha256 must be 64 hex chars");
  return t;
}
function jo(e) {
  return new Promise((t, n) => {
    const r = mr("sha256"), o = ar(e);
    o.on("error", n), o.on("data", (s) => r.update(s)), o.on("end", () => t(r.digest("hex")));
  });
}
async function Do(e) {
  const { tarballPath: t, expectedSha256: n, managedDir: r } = e;
  if (!w(t))
    throw new Error(`offline tarball missing: ${t}`);
  const o = await jo(t);
  if (o.toLowerCase() !== n.toLowerCase())
    throw new Error(
      `offline tarball SHA-256 mismatch (expected ${n}, got ${o}) — aborting`
    );
  const s = a.join(r, ".offline-cache");
  se(s, { recursive: !0, force: !0 }), V(s, { recursive: !0 }), await Ro(t, s);
  const i = a.join(s, "_cacache");
  if (!w(i))
    throw new Error(`extracted tarball is missing _cacache/ under ${s}`);
  return i;
}
function Po(e) {
  const { outstandingPackages: t, resolution: n } = e;
  if (t.length === 0) return { kind: "registry" };
  if (!n.present) return { kind: "registry" };
  const r = new Map(n.manifest.packages.map((s) => [s.name, s.version])), o = t.filter((s) => !r.has(s));
  return o.length === 0 ? { kind: "offline", pinMap: r } : { kind: "offline-incomplete", missing: o, pinMap: r };
}
function Ao(e) {
  const { managedDir: t, cacheDir: n, packages: r } = e;
  return [
    "install",
    "--prefix",
    t,
    "--cache",
    n,
    // --prefer-offline: use cache when available, fall back to network on miss.
    // We avoid --offline (strict) because cache entries built by a different
    // npm major version (e.g. npm 11 on build machine vs npm 10 bundled with
    // Node.js v22.12.0) use incompatible cache key formats.
    "--prefer-offline",
    "--no-audit",
    "--no-fund",
    ...r.map((o) => `${o.name}@${o.version}`)
  ];
}
function Ro(e, t) {
  return new Promise((n, r) => {
    var i;
    const o = me("tar", ["-xzf", e, "-C", t], {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: !0
    });
    let s = "";
    (i = o.stderr) == null || i.on("data", (c) => {
      s += c.toString();
    }), o.on("error", (c) => r(new Error(`tar spawn failed: ${c.message}`))), o.on("close", (c) => {
      c === 0 ? n() : r(new Error(`tar exited ${c}: ${s.trim()}`));
    });
  });
}
function No() {
  V(E, { recursive: !0 });
  const e = a.join(E, "package.json");
  w(e) || he(e, JSON.stringify({ name: "pi-dashboard-managed", private: !0, type: "module" }, null, 2));
}
function To(e, t) {
  try {
    const n = qe(e, [t, "--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5e3,
      encoding: "utf-8"
    });
    if (n.status !== 0) return !1;
    const r = (n.stdout ?? "").toString().trim();
    return /^\d+\.\d+\.\d+/.test(r);
  } catch {
    return !1;
  }
}
function An() {
  if (vn()) {
    const r = yn(), o = process.platform === "win32" ? a.join(E, "node", "node_modules", "npm", "bin", "npm-cli.js") : a.join(E, "node", "lib", "node_modules", "npm", "bin", "npm-cli.js");
    if (w(o) && To(r, o))
      return `"${r}" "${o}"`;
  }
  const e = K(), t = Dn();
  if (process.platform === "win32" && e && t)
    return `"${e}" "${t}"`;
  const n = Ye();
  if (n.has("node") && n.resolve("node").ok)
    return "npm";
  if (e && t)
    return `"${e}" "${t}"`;
  throw new Error("No Node.js available. Cannot install dependencies.");
}
function Ze() {
  let e = Ir(process.env);
  const t = K();
  if (t) {
    const n = a.dirname(t);
    (e.PATH ?? "").split(a.delimiter).includes(n) || (e = { ...e, PATH: `${n}${a.delimiter}${e.PATH || ""}` });
  }
  return e;
}
function _o(e, t, n, r) {
  return new Promise((o, s) => {
    var y, g, v;
    const i = Ze(), c = ((y = n.match(/"[^"]+"|\S+/g)) == null ? void 0 : y.map((h) => h.replace(/^"|"$/g, ""))) || [n], d = c[0], l = [...c.slice(1), "install", ...e], f = me(d, l, {
      cwd: t,
      env: i,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 3e5
    });
    let u = "";
    const p = (h) => {
      const m = h.toString();
      u += m;
      const b = m.split(`
`).filter((P) => P.trim()), S = b[b.length - 1];
      S && r && r(S.trim().substring(0, 120));
    };
    (g = f.stdout) == null || g.on("data", p), (v = f.stderr) == null || v.on("data", p), f.on("error", (h) => s(new Error(h.message))), f.on("close", (h) => {
      h !== 0 ? s(new Error(u.slice(-500) || `npm install exited with code ${h}`)) : o();
    });
  });
}
async function Qe(e, t) {
  No();
  const n = K(), r = n ? process.platform === "win32" ? a.dirname(n) : a.dirname(a.dirname(n)) : null, o = await Ot({
    bundledNodeDir: r,
    managedDir: E,
    progress: e
  });
  o.ok || console.error("[dependency-installer] installManagedNode failed:", o.error);
  const s = An(), i = [
    "@earendil-works/pi-coding-agent",
    "@fission-ai/openspec"
  ], c = new Set(t || []), d = i.filter((h) => !c.has(h)), l = process.resourcesPath, f = l ? Pn(l) : { present: !1, reason: "no resourcesPath" }, u = Po({ outstandingPackages: d, resolution: f });
  if (u.kind === "offline" && f.present)
    try {
      await Mo({
        resolution: f,
        outstanding: d,
        pinMap: u.pinMap,
        npmCmd: s,
        onProgress: e
      });
      for (const h of i.filter((m) => c.has(m))) {
        const m = h.split("/").pop() || h;
        e == null || e({ step: m, status: "done", output: "Already installed (system)" });
      }
      return;
    } catch (h) {
      console.error("[dependency-installer] Offline install failed, falling back to registry:", (h == null ? void 0 : h.message) ?? h), e == null || e({
        step: "offline-install",
        status: "error",
        error: `Offline cache failed (${(h == null ? void 0 : h.message) ?? "unknown"}) — falling back to registry`
      });
      for (const m of d.map((b) => b.split("/").pop()))
        e == null || e({ step: m, status: "running", output: "Falling back to registry…" });
    }
  u.kind === "offline-incomplete" && (e == null || e({
    step: "offline-cache",
    status: "error",
    error: `Bundled cache is missing pins for: ${u.missing.join(", ")} — using registry`
  }));
  for (const h of i) {
    const m = h.split("/").pop() || h;
    c.has(h) && (e == null || e({ step: m, status: "done", output: "Already installed (system)" }));
  }
  const p = i.filter((h) => !c.has(h));
  if (p.length === 0) return;
  const y = Oo(s), g = Ze(), v = await So({
    packages: p,
    managedDir: E,
    npmArgv: y,
    env: g,
    progress: e
  });
  if (!v.ok)
    throw new Error(v.error);
}
function Oo(e) {
  var t;
  return ((t = e.match(/"[^"]+"|\S+/g)) == null ? void 0 : t.map((n) => n.replace(/^"|"$/g, ""))) ?? [e];
}
async function Mo(e) {
  const { resolution: t, outstanding: n, pinMap: r, npmCmd: o, onProgress: s } = e;
  s == null || s({ step: "offline-cache", status: "running", output: "Preparing offline cache" });
  let i;
  try {
    i = await Do({
      tarballPath: t.tarballPath,
      expectedSha256: t.manifest.sha256,
      managedDir: E
    });
  } catch (u) {
    throw s == null || s({ step: "offline-cache", status: "error", error: u.message }), u;
  }
  s == null || s({ step: "offline-cache", status: "done", output: "Cache ready" });
  const c = n.map((u) => ({
    name: u,
    version: r.get(u)
  })), d = c.map((u) => u.name.split("/").pop()).join(", ");
  s == null || s({ step: "offline-install", status: "running", output: `Installing ${d}` });
  const l = c.map((u) => u.name.split("/").pop());
  for (const u of l)
    s == null || s({ step: u, status: "running", output: "Installing…" });
  const f = Ao({
    managedDir: E,
    cacheDir: a.dirname(i),
    // parent of _cacache is what npm expects for --cache
    packages: c
  });
  try {
    const [, ...u] = f;
    await Io(u, o, (p) => {
      s == null || s({ step: "offline-install", status: "running", output: p });
      for (const y of l)
        p.includes(y) && (s == null || s({ step: y, status: "running", output: p }));
    });
  } catch (u) {
    s == null || s({ step: "offline-install", status: "error", error: u.message });
    for (const p of l)
      s == null || s({ step: p, status: "error", error: u.message });
    throw u;
  }
  s == null || s({ step: "offline-install", status: "done", output: `Installed ${d}` });
  for (const u of l)
    s == null || s({ step: u, status: "done", output: "Installed" });
  s == null || s({ step: "offline-cache", status: "running", output: "Cleaning up" });
  try {
    se(a.join(E, ".offline-cache"), { recursive: !0, force: !0 }), s == null || s({ step: "offline-cache", status: "done", output: "Cleaned" });
  } catch (u) {
    s == null || s({ step: "offline-cache", status: "done", output: `Cleanup warning: ${u.message}` });
  }
}
function Io(e, t, n) {
  return new Promise((r, o) => {
    var p, y, g;
    const s = Ze(), i = ((p = t.match(/"[^"]+"|\S+/g)) == null ? void 0 : p.map((v) => v.replace(/^"|"$/g, ""))) || [t], c = i[0], d = [...i.slice(1), "install", ...e], l = me(c, d, {
      env: s,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 3e5
    });
    let f = "";
    const u = (v) => {
      const h = v.toString();
      f += h;
      const m = h.split(`
`).filter((S) => S.trim()), b = m[m.length - 1];
      b && n && n(b.trim().substring(0, 120));
    };
    (y = l.stdout) == null || y.on("data", u), (g = l.stderr) == null || g.on("data", u), l.on("error", (v) => o(new Error(v.message))), l.on("close", (v) => {
      if (v !== 0) {
        const h = f.split(/\r?\n/).filter((b) => /^npm (error|ERR!)/i.test(b) && !/A complete log of this run/i.test(b)).map((b) => b.replace(/^npm (error|ERR!)\s*/i, "").trim()).filter((b) => b.length > 0), m = h.length > 0 ? h.join(`
`).slice(0, 1500) : f.slice(-500) || `npm install exited with code ${v}`;
        o(new Error(m));
      } else
        r();
    });
  });
}
async function Rn() {
  const { getDefaultRegistry: e } = await Promise.resolve().then(() => lo), t = e(), { module: n } = await t.resolveModule("pi-coding-agent");
  return n;
}
async function Co(e, t, n) {
  var p;
  if (e.length === 0) return 0;
  const { RECOMMENDED_EXTENSIONS: r } = await Promise.resolve().then(() => On), o = await Rn();
  if (!(o != null && o.DefaultPackageManager) || !(o != null && o.SettingsManager))
    throw new Error(
      "pi-coding-agent is not installed. Install recommended extensions failed."
    );
  const s = a.join(D.homedir(), ".pi", "agent"), i = D.homedir(), c = o.SettingsManager.create(i, s), d = new o.DefaultPackageManager({ cwd: i, agentDir: s, settingsManager: c }), l = process.env.PATH, f = Ze();
  f.PATH && f.PATH !== l && (process.env.PATH = f.PATH);
  let u = 0;
  try {
    for (const y of e) {
      const g = r.find((h) => h.id === y);
      if (!g)
        throw t == null || t({
          step: y,
          status: "error",
          error: `Unknown recommended id: ${y}`
        }), new Error(`Unknown recommended id: ${y}`);
      const v = g.displayName;
      if (n != null && n.has(y)) {
        t == null || t({ step: v, status: "done", output: "Already installed (bundled)" }), u++;
        continue;
      }
      t == null || t({ step: v, status: "running" });
      try {
        await Lo(g.source, s), (p = d.setProgressCallback) == null || p.call(d, (h) => {
          h != null && h.message && (t == null || t({ step: v, status: "running", output: String(h.message).slice(0, 120) }));
        }), await d.installAndPersist(g.source, { local: !1 }), t == null || t({ step: v, status: "done" }), u++;
      } catch (h) {
        const m = String((h == null ? void 0 : h.message) ?? h ?? "install failed");
        throw t == null || t({ step: v, status: "error", error: m }), h;
      }
    }
  } finally {
    l !== void 0 ? process.env.PATH = l : delete process.env.PATH;
  }
  return u;
}
async function Lo(e, t) {
  const n = Nn(e);
  if (!n) return;
  const r = a.join(t, "git", n.host, n.path);
  if (w(r)) return;
  let o = e.trim().replace(/^git:/, "");
  const s = o.lastIndexOf("@");
  if (s > o.indexOf("://") + 3 && o[s - 1] !== ":") {
    const i = o.slice(0, s);
    (/\.git$/.test(i) || /github|gitlab|bitbucket/.test(i)) && (o = i);
  }
  V(a.dirname(r), { recursive: !0 }), await new Promise((i, c) => {
    var f;
    const d = me("git", ["clone", o, r], {
      stdio: ["ignore", "pipe", "pipe"]
      // Critically NOT shell:true — spawn passes argv discretely so
      // spaces in destDir don't get re-split by the shell.
    });
    let l = "";
    (f = d.stderr) == null || f.on("data", (u) => {
      l += u.toString();
    }), d.on("error", (u) => c(new Error(`git spawn failed: ${u.message}`))), d.on("close", (u) => {
      u === 0 ? i() : c(new Error(`git clone exited ${u}: ${l.trim().slice(-500)}`));
    });
  });
}
function Nn(e) {
  const t = e.trim().replace(/^git:/, ""), n = t.match(/^git@([^:]+):(.+?)(?:\.git)?\/?$/);
  if (n)
    return { host: n[1], path: Jt(n[2]).replace(/\.git$/, "") };
  if (/^(https?|ssh|git):\/\//i.test(t))
    try {
      const r = new URL(t), s = r.pathname.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/, ""), i = Jt(s);
      return !r.hostname || !i ? null : { host: r.hostname, path: i };
    } catch {
      return null;
    }
  return null;
}
function Jt(e) {
  const t = e.indexOf("@");
  return t < 0 ? e : e.slice(0, t);
}
function Bo() {
  const e = process.resourcesPath;
  if (!e) return null;
  const t = a.join(e, "bundled-extensions");
  return w(t) ? t : null;
}
async function Fo(e) {
  var u, p, y;
  const t = Bo();
  if (!t) return [];
  const { BUNDLED_EXTENSION_IDS: n, RECOMMENDED_EXTENSIONS: r } = await Promise.resolve().then(() => On), o = new Set(
    re(t, { withFileTypes: !0 }).filter((g) => g.isDirectory()).map((g) => g.name)
  ), s = await Rn();
  if (!(s != null && s.DefaultPackageManager) || !(s != null && s.SettingsManager))
    return [];
  const i = a.join(D.homedir(), ".pi", "agent"), c = D.homedir(), d = s.SettingsManager.create(c, i), l = new s.DefaultPackageManager({ cwd: c, agentDir: i, settingsManager: d }), f = [];
  for (const g of n) {
    if (!o.has(g)) continue;
    const v = r.find((S) => S.id === g);
    if (!v) continue;
    const h = v.displayName, m = a.join(t, g), b = v.bundleSource ?? v.source;
    try {
      const S = (u = l.getInstalledPath) == null ? void 0 : u.call(l, v.source, "user"), P = b !== v.source ? (p = l.getInstalledPath) == null ? void 0 : p.call(l, b, "user") : void 0;
      if (S && w(S) ? S : P && w(P) ? P : void 0) {
        e == null || e({ step: h, status: "done", output: "Already installed" }), f.push(g);
        continue;
      }
      const M = Nn(b);
      if (!M) {
        e == null || e({
          step: h,
          status: "error",
          error: `Cannot parse git source: ${b}`
        });
        continue;
      }
      const A = a.join(i, "git", M.host, M.path);
      e == null || e({ step: h, status: "running", output: "Copying bundled files…" }), V(a.dirname(A), { recursive: !0 }), $t(m, A, { recursive: !0 });
      const I = a.join(A, "package.json");
      if (w(I))
        try {
          const _ = JSON.parse(R(I, "utf8"));
          if (_.dependencies && Object.keys(_.dependencies).length > 0) {
            e == null || e({ step: h, status: "running", output: "Installing runtime dependencies…" });
            const we = An();
            await _o(["--omit=dev"], A, we, (ye) => {
              e == null || e({ step: h, status: "running", output: ye });
            });
          }
        } catch (_) {
          e == null || e({
            step: h,
            status: "running",
            output: `npm install skipped: ${String((_ == null ? void 0 : _.message) ?? _).slice(0, 80)}`
          });
        }
      l.addSourceToSettings(b, { local: !1 }), await ((y = d.flush) == null ? void 0 : y.call(d)), e == null || e({ step: h, status: "done", output: "Bundled" }), f.push(g);
    } catch (S) {
      const P = String((S == null ? void 0 : S.message) ?? S ?? "bundled activation failed");
      e == null || e({ step: h, status: "error", error: P });
    }
  }
  return f;
}
const Tn = [
  {
    id: "pi-anthropic-messages",
    source: "npm:@blackbelt-technology/pi-anthropic-messages",
    bundleSource: "https://github.com/BlackBeltTechnology/pi-anthropic-messages.git",
    displayName: "pi-anthropic-messages",
    fallbackDescription: `Protocol bridge that makes pi's custom tools work with any anthropic-messages endpoint for Claude models (direct Anthropic OAuth/API key, 9Router cc/claude-*, pi-model-proxy, any Claude Code-flavored proxy). Required whenever a provider has api: "anthropic-messages" with a Claude model — without it, tool calls fall back to Claude Code's built-in bash_ide sandbox.`,
    status: "required",
    unlocks: ["Tool calls on Anthropic OAuth / 9Router cc/* / proxy providers"],
    autowired: !0
  },
  {
    id: "tintinweb-pi-subagents",
    source: "npm:@tintinweb/pi-subagents",
    displayName: "@tintinweb/pi-subagents",
    fallbackDescription: "Claude Code-style autonomous sub-agents for pi. Registers the Agent tool and its companions. The dashboard has custom card UI for it.",
    status: "strongly-suggested",
    unlocks: [
      "Agent tool card UI",
      "Subagent activity badge",
      "get_subagent_result / steer_subagent renderers"
    ],
    toolsRegistered: ["Agent", "get_subagent_result", "steer_subagent"],
    autowired: !0
  },
  {
    id: "pi-flows",
    source: "npm:@blackbelt-technology/pi-flows",
    bundleSource: "https://github.com/BlackBeltTechnology/pi-flows.git",
    displayName: "pi-flows",
    fallbackDescription: "Flow engine, dashboard, and orchestration extensions for pi. Powers the dashboard's Flow view, role aliases, and multi-agent orchestration tools.",
    status: "strongly-suggested",
    unlocks: [
      "Flow dashboard",
      "Role aliases (@planning, @coding, …)",
      "subagent / flow_write / flow_results / agent_write / ask_user / skill_read / finish tools"
    ],
    toolsRegistered: [
      "subagent",
      "agent_catalog",
      "agent_write",
      "flow_write",
      "flow_results",
      "skill_read",
      "ask_user",
      "finish"
    ],
    autowired: !0
  },
  {
    id: "pi-web-access",
    source: "npm:pi-web-access",
    displayName: "pi-web-access",
    fallbackDescription: "Web search, URL fetching, GitHub repo cloning, PDF extraction, and YouTube / local video analysis for pi.",
    status: "strongly-suggested",
    unlocks: ["web_search", "code_search", "fetch_content", "get_search_content"],
    toolsRegistered: [
      "web_search",
      "code_search",
      "fetch_content",
      "get_search_content"
    ]
  },
  {
    id: "pi-agent-browser",
    source: "npm:pi-agent-browser",
    displayName: "pi-agent-browser",
    fallbackDescription: "Browser automation (open, snapshot, click, fill, screenshot) via the agent-browser CLI.",
    status: "optional",
    unlocks: ["browser tool (open, snapshot, click, screenshot)"],
    toolsRegistered: ["browser"]
  },
  {
    id: "pi-memory-honcho",
    source: "npm:pi-memory-honcho",
    displayName: "pi-memory-honcho",
    fallbackDescription: "Persistent cross-session memory backed by Honcho. Pairs with the @blackbelt-technology/pi-dashboard-honcho-plugin dashboard plugin which adds a settings panel, per-card actions, and optional self-hosted Honcho server lifecycle.",
    status: "optional",
    unlocks: [
      "Honcho memory tools (honcho_search, honcho_context, honcho_profile)",
      "Honcho settings panel (when honcho-plugin is loaded)",
      "Per-card 🧠 status badge + interview/sync/map actions"
    ],
    toolsRegistered: ["honcho_search", "honcho_context", "honcho_profile"],
    autowired: !0
  }
], _n = [
  "pi-anthropic-messages",
  "pi-flows"
], On = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  BUNDLED_EXTENSION_IDS: _n,
  RECOMMENDED_EXTENSIONS: Tn
}, Symbol.toStringTag, { value: "Module" }));
function zo(e) {
  return a.join(e, "offline-packages", "manifest.json");
}
function Uo(e) {
  return a.join(e, "bundled-extensions");
}
function Ho(e) {
  const t = zo(e);
  if (!w(t))
    return [];
  let n;
  try {
    n = JSON.parse(R(t, "utf8"));
  } catch {
    return [];
  }
  return (n.pins ?? n.packages ?? []).map((o) => ({
    name: o.name,
    version: o.version,
    required: !0,
    kind: "npm",
    source: "offline-cache"
  }));
}
function Vo(e) {
  const t = Uo(e);
  if (!w(t))
    return [];
  let n;
  try {
    n = re(t, { withFileTypes: !0 }).filter((o) => o.isDirectory()).map((o) => o.name);
  } catch {
    return [];
  }
  const r = [];
  for (const o of n) {
    const s = a.join(t, o, "package.json");
    if (!w(s)) continue;
    let i;
    try {
      i = JSON.parse(R(s, "utf8"));
    } catch {
      continue;
    }
    if (!i.name || !i.version) continue;
    const c = Tn.find((d) => d.id === o);
    _n.includes(o), r.push({
      name: i.name,
      version: i.version,
      required: !1,
      kind: "pi-extension",
      source: "bundled-git",
      // displayName lives only in RECOMMENDED_EXTENSIONS; surface it for the
      // wizard via a side-channel field on the package object. The
      // `InstallablePackage` interface doesn't declare it, but the wizard
      // renderer reads catalogs by structural typing, so extra fields are
      // safe.
      ...c ? { displayName: c.displayName } : {}
    });
  }
  return r.sort((o, s) => o.name.localeCompare(s.name)), r;
}
function Jo(e) {
  const t = Ho(e.resourcesPath), n = Vo(e.resourcesPath);
  return {
    version: "1.0",
    schemaVersion: 2,
    packages: [...t, ...n]
  };
}
function Wo() {
  return a.join(D.homedir(), ".pi-dashboard", "doctor.log");
}
function Ve(e) {
  const t = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    ...e
  }, n = JSON.stringify(t) + `
`;
  try {
    const r = Wo();
    T.mkdirSync(a.dirname(r), { recursive: !0 }), T.appendFileSync(r, n, { encoding: "utf-8" });
  } catch (r) {
    console.warn(
      `[audit-log] write failed: ${r instanceof Error ? r.message : String(r)}`
    );
  }
  return t;
}
const Re = /* @__PURE__ */ new Set([
  "@earendil-works/pi-coding-agent",
  "@fission-ai/openspec",
  "tsx"
]);
function Go() {
  return a.join(D.homedir(), ".pi", "dashboard");
}
function qo(e) {
  return a.join(e, "installable.json");
}
async function Ko(e, t) {
  const n = Go(), r = qo(n), o = r + ".tmp." + process.pid;
  await T.promises.mkdir(n, { recursive: !0 }), await T.promises.writeFile(o, JSON.stringify(e, null, 2), "utf-8"), await T.promises.rename(o, r);
}
let pt = null;
function Wt() {
  const e = pt;
  return pt = null, e;
}
function Yo(e) {
  const t = Jo({ resourcesPath: e ?? "" });
  if (!e) return t;
  const n = a.join(e, "bundled-extensions");
  if (!w(n)) return t;
  let r;
  try {
    r = re(n, { withFileTypes: !0 }).filter((o) => o.isDirectory()).map((o) => o.name);
  } catch {
    return t;
  }
  for (const o of r) {
    const s = a.join(n, o, "package.json");
    if (!w(s)) continue;
    let i;
    try {
      i = JSON.parse(R(s, "utf8"));
    } catch {
      continue;
    }
    if (!i.name) continue;
    const c = t.packages.find(
      (d) => d.name === i.name && d.kind === "pi-extension"
    );
    c && (c.id = o);
  }
  return t;
}
function Xo(e) {
  $.removeHandler("wizard:detect"), $.handle("wizard:detect", async () => {
    const [t, n, r] = await Promise.all([
      Promise.resolve(Xe()),
      Promise.resolve($n()),
      Promise.resolve(ne())
    ]);
    return {
      pi: { found: t.found, source: t.source },
      openspec: { found: n.found, source: n.source },
      node: { found: r.found, source: r.source }
    };
  }), $.removeHandler("wizard:get-catalog"), $.handle("wizard:get-catalog", async () => {
    const t = process.resourcesPath;
    return Yo(t);
  }), $.removeHandler("wizard:save-selection"), $.handle(
    "wizard:save-selection",
    async (t, n) => {
      const r = {
        version: n.version ?? "1.0",
        schemaVersion: 2,
        packages: n.packages ?? []
      };
      await Ko(r);
    }
  ), $.removeHandler("wizard:install-standalone"), $.handle("wizard:install-standalone", async (t, n) => {
    const r = e();
    try {
      await Qe((o) => {
        r == null || r.webContents.send("wizard:progress", o);
      }, n), Ve({
        operation: "wizard.install",
        packages: [],
        skipped: n ?? [],
        outcome: "ok"
      });
    } catch (o) {
      throw Ve({
        operation: "wizard.install",
        packages: [],
        skipped: n ?? [],
        outcome: "failed",
        error: o instanceof Error ? o.message : String(o)
      }), o;
    }
  }), $.removeHandler("wizard:install-bundled-extensions"), $.handle(
    "wizard:install-bundled-extensions",
    async (t, n) => {
      const r = e(), o = (l) => {
        r == null || r.webContents.send("wizard:progress", l);
      }, s = await Fo(o), i = new Set(s), c = (n ?? []).filter((l) => !i.has(l));
      let d = s.length;
      return c.length > 0 && (d += await Co(c, o, i)), { installed: d };
    }
  ), $.removeHandler("wizard:request-launch-path"), $.handle(
    "wizard:request-launch-path",
    async (t, n) => {
      typeof n != "string" || !n.startsWith("/") || n.startsWith("//") || (pt = n);
    }
  );
}
function Zo(e) {
  if (!e) return !1;
  const t = e.replace(/\\/g, "/");
  return /\/tsx\//i.test(t);
}
function ht(e) {
  if (e.startsWith("file:")) return e;
  if (/^[A-Za-z]:[\\/]/.test(e))
    return `file:///${e.replace(/\\/g, "/")}`;
  const n = a.isAbsolute(e) ? e : a.resolve(e);
  return kt(n).href;
}
function Mn(e, t = process.platform) {
  return Zo(e) ? !1 : t === "win32";
}
function Qo(e) {
  const t = Mn(e.loader, e.platform), n = [
    "--import",
    ht(e.loader),
    t ? ht(e.entry) : e.entry
  ];
  return e.args && e.args.length > 0 && n.push(...e.args), n;
}
function es(e) {
  const t = e.nodeBin ?? process.execPath;
  let n;
  return e.loader ? n = Qo({
    loader: e.loader,
    entry: e.entry,
    args: e.args
  }) : (n = [Mn(e.loader) ? ht(e.entry) : e.entry], e.args && n.push(...e.args)), me(t, n, e.spawnOptions ?? {});
}
const ts = 2e3, ns = 0, rs = 500;
async function fe(e, t = "localhost", n) {
  const r = (n == null ? void 0 : n.timeoutMs) ?? ts, o = (n == null ? void 0 : n.retries) ?? ns, s = (n == null ? void 0 : n.retryDelayMs) ?? rs, i = (n == null ? void 0 : n._sleep) ?? ((l) => new Promise((f) => setTimeout(f, l))), c = o + 1;
  let d = { running: !1 };
  for (let l = 0; l < c; l++) {
    const f = await os(e, t, r);
    if (f.running || f.portConflict) return f;
    d = f, l < c - 1 && await i(s);
  }
  return d;
}
async function os(e, t, n) {
  const r = new AbortController(), o = setTimeout(() => r.abort(), n);
  try {
    const s = await fetch(`http://${t}:${e}/api/health`, {
      signal: r.signal
    });
    if (clearTimeout(o), !s.ok)
      return { running: !1, portConflict: !0 };
    const i = await s.json();
    if (i && i.ok === !0 && typeof i.pid == "number") {
      const c = typeof i.version == "string" ? i.version : void 0;
      return { running: !0, pid: i.pid, version: c };
    }
    return { running: !1, portConflict: !0 };
  } catch (s) {
    return clearTimeout(o), s instanceof Error && s.name === "AbortError" ? { running: !1 } : { running: !1 };
  }
}
class In extends Error {
  constructor(t = "Cannot find pi's TypeScript loader (jiti). Is @earendil-works/pi-coding-agent or @mariozechner/pi-coding-agent installed?") {
    super(t), this.name = "JitiNotFoundError";
  }
}
class Cn extends Error {
  constructor(n) {
    super(`Port ${n} is occupied by a non-dashboard service`);
    N(this, "port");
    this.name = "PortConflictError", this.port = n;
  }
}
class mt extends Error {
  constructor(n, r = null) {
    super(`Server child exited (code=${n}, signal=${r}) before reaching health`);
    N(this, "code");
    N(this, "signal");
    this.name = "EarlyExitError", this.code = n, this.signal = r;
  }
}
const ss = 300;
function is(e) {
  return new Promise((t) => setTimeout(t, e));
}
function as(e) {
  const t = {};
  for (const [n, r] of Object.entries(e))
    typeof r == "string" && (t[n] = r);
  return t;
}
async function Ln(e) {
  var S, P, O, M;
  const t = e.nodeBin ?? process.execPath, n = e._resolveJiti ?? (() => new G({ processExecPath: t }).resolveJiti({ anchor: e.anchor })), r = e._spawnNodeScript ?? es, o = e._isDashboardRunning ?? fe, s = e._pollIntervalMs ?? ss, i = e._now ?? Date.now, c = e._sleep ?? is, d = ((S = e._fs) == null ? void 0 : S.mkdirSync) ?? V, l = ((P = e._fs) == null ? void 0 : P.openSync) ?? cr, f = ((O = e._fs) == null ? void 0 : O.closeSync) ?? lr, u = ((M = e._fs) == null ? void 0 : M.writeSync) ?? ur, p = n();
  if (!p) throw new In();
  const y = new G({ processExecPath: t }).buildSpawnEnv(process.env), g = as(y);
  if (e.starter && !(e.env && "DASHBOARD_STARTER" in e.env) && (g.DASHBOARD_STARTER = e.starter), e.env)
    for (const [A, I] of Object.entries(e.env))
      typeof I == "string" ? g[A] = I : I === void 0 && delete g[A];
  let v, h;
  if (e.stdio === "ignore")
    h = "ignore";
  else {
    const { logFile: A } = e.stdio;
    d(dr(A), { recursive: !0 }), v = l(A, "a");
    const I = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${e.starter ?? "dashboard"} launch (parent pid ${process.pid}, port ${e.port}, cli ${e.cliPath})
`;
    try {
      u(v, I);
    } catch {
    }
    h = ["ignore", v, v];
  }
  let m;
  try {
    m = r({
      nodeBin: t,
      loader: p,
      entry: e.cliPath,
      args: e.extraArgs ? [...e.extraArgs] : void 0,
      spawnOptions: {
        detached: e.detach ?? !0,
        stdio: h,
        env: g,
        cwd: e.cwd,
        windowsHide: !0
      }
    });
  } finally {
    if (v !== void 0)
      try {
        f(v);
      } catch {
      }
  }
  try {
    m.unref();
  } catch {
  }
  if (!m.pid)
    throw new mt(m.exitCode ?? null, m.signalCode ?? null);
  const b = i() + e.healthTimeoutMs;
  for (; ; ) {
    if (m.exitCode !== null)
      throw new mt(m.exitCode, m.signalCode ?? null);
    let A;
    try {
      A = await o(e.port);
    } catch {
      A = { running: !1 };
    }
    if (A.running) {
      if (e.onExitAfterReady) {
        const I = e.onExitAfterReady;
        let _ = !1;
        m.on("exit", (ae, we) => {
          if (!_) {
            _ = !0;
            try {
              I(ae, we);
            } catch {
            }
          }
        });
      }
      return {
        childPid: m.pid,
        reportedPid: A.pid ?? null,
        healthOk: !0
      };
    }
    if (A.portConflict)
      throw new Cn(e.port);
    if (i() >= b)
      throw new Error("readiness timeout");
    await c(s);
  }
}
function cs(e) {
  return a.join(D.homedir(), ".pi", "dashboard");
}
function et(e) {
  return a.join(cs(), "server.log");
}
function ls(e) {
  const t = e.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!t) return !1;
  const n = Number(t[1]), r = Number(t[2]);
  return n === 22 && r < 18 || n === 24 && r >= 1 && r < 3;
}
function Mt(e) {
  const { bundledNodeDir: t, systemNode: n, processExecPath: r, platform: o } = e, s = e.existsSync ?? w;
  if (t) {
    const i = o === "win32" ? a.win32.join : a.posix.join, c = o === "win32" ? i(t, "node.exe") : i(t, "bin", "node");
    if (s(c)) {
      const d = e.bundledNodeVersion;
      if (!d || !ls(d))
        return { kind: "bundled", nodeBin: c };
    }
  }
  return n.found && n.path ? { kind: "system", nodeBin: n.path, version: n.version ?? "" } : { kind: "execpath-fallback", nodeBin: r, needsElectronRunAsNode: !0 };
}
const Bn = a.dirname(pe(import.meta.url));
let Fn = !1, gt = null, It = !1;
function zn(e) {
  It = e;
}
function us() {
  return It;
}
function ds(e) {
  gt = e, It = !1;
}
function fs(e) {
  return (t, n) => {
    if (e.isGraceful()) {
      e.log(
        `[server-lifecycle] server child exited gracefully code=${t} signal=${n ?? "null"}`
      );
      return;
    }
    e.log(
      `[server-lifecycle] server child exited unexpectedly code=${t} signal=${n ?? "null"} — routing to recovery`
    );
    try {
      e.onCrash(t, n);
    } catch (r) {
      e.log(
        `[server-lifecycle] crash handler threw: ${r instanceof Error ? r.message : String(r)}`
      );
    }
  };
}
function ps(e) {
  return e.storedPid === null ? !1 : e.starter === "Electron" && e.healthPid === e.storedPid;
}
function hs() {
  try {
    const e = process.resourcesPath;
    if (e) {
      const n = a.join(e, "server", "packages", "server", "package.json");
      if (w(n))
        return JSON.parse(R(n, "utf-8")).version ?? null;
    }
    const t = a.resolve(Bn, "..", "..", "..", "server", "package.json");
    if (w(t))
      return JSON.parse(R(t, "utf-8")).version ?? null;
  } catch {
  }
  return null;
}
function ms(e) {
  const t = hs();
  if (t) {
    if (!e) {
      console.warn(`[pi-dashboard] Server does not report a version (expected ${t}). It may be outdated.`);
      return;
    }
    e !== t && console.warn(`[pi-dashboard] Server version ${e} does not match expected version ${t}.`);
  }
}
const gs = 15e3;
function ws(e) {
  const t = e.readyError.toLowerCase().includes("exit"), n = e.cliPath ? `Command: ${e.cliPath} start --port ${e.port ?? "?"} --pi-port ${e.piPort ?? "?"}` : `Command: ${e.spawnBin ?? "?"} ${(e.spawnArgs ?? []).join(" ")}`, r = t ? `Server child process exited prematurely (${e.readyError}).
This usually means a missing dependency or wrong TypeScript loader.
` : `Server did not respond within 15 seconds (${e.readyError}).
The server is likely still starting; the loading page will keep polling — try the Doctor button if it doesn't connect.
`, o = `${n}
CWD: ${e.cwd}
` + (e.logTail ? `
Server log:
${e.logTail}` : `
No server log available.`);
  return new Error(r + o);
}
function X() {
  const e = { port: 8e3, piPort: 9999, knownServers: [] };
  try {
    const t = a.join(D.homedir(), ".pi", "dashboard", "config.json");
    if (!w(t)) return e;
    const n = R(t, "utf-8").trim();
    if (!n) return e;
    const r = JSON.parse(n), o = Array.isArray(r.knownServers) ? r.knownServers.filter((s) => s && typeof s.host == "string" && typeof s.port == "number").map((s) => ({ host: s.host, port: s.port, ...typeof s.label == "string" ? { label: s.label } : {} })) : [];
    return {
      port: typeof r.port == "number" ? r.port : e.port,
      piPort: typeof r.piPort == "number" ? r.piPort : e.piPort,
      knownServers: o
    };
  } catch {
    return e;
  }
}
async function Un() {
  const e = X(), t = await fe(e.port);
  if (t.running)
    return ms(t.version), `http://localhost:${e.port}`;
  if (t.portConflict)
    throw new Error(`Port ${e.port} is in use by another service. Change the dashboard port in ~/.pi/dashboard/config.json`);
  return await vs(e.port, e.piPort), Fn = !0, `http://localhost:${e.port}`;
}
function ys() {
  const e = [
    // Bundled with Electron app (resources/server/)
    process.resourcesPath ? a.join(process.resourcesPath, "server", "packages", "server", "src", "cli.ts") : null,
    // Dev mode: relative to electron package
    a.resolve(Bn, "..", "..", "..", "..", "server", "src", "cli.ts"),
    // Managed install
    a.join(E, "node_modules", "@blackbelt-technology", "pi-agent-dashboard", "packages", "server", "src", "cli.ts")
  ].filter(Boolean);
  try {
    e.push(require.resolve("@blackbelt-technology/pi-dashboard-server/cli.ts"));
  } catch {
  }
  return e.find((t) => {
    try {
      return w(t);
    } catch {
      return !1;
    }
  }) || null;
}
async function vs(e, t) {
  const n = ys();
  if (!n)
    throw new Error("Dashboard server CLI not found. Run the setup wizard or reinstall the app.");
  const r = K(), o = r ? a.dirname(a.dirname(r)) : null;
  let s;
  if (r)
    try {
      s = Et(r, ["--version"], { encoding: "utf8", timeout: 5e3 }).trim();
    } catch {
      s = void 0;
    }
  const i = ne(), c = Mt({
    bundledNodeDir: o,
    systemNode: i,
    processExecPath: process.execPath,
    platform: process.platform,
    bundledNodeVersion: s
  }), d = Xe(), l = d.found && d.path ? a.dirname(d.path) : null, f = a.dirname(c.nodeBin), u = {};
  for (const [m, b] of Object.entries(process.env))
    typeof b == "string" && (u[m] = b);
  const p = [l, f].filter(Boolean).join(a.delimiter);
  p && (u.PATH = `${p}${a.delimiter}${u.PATH || ""}`), c.kind === "execpath-fallback" && (u.ELECTRON_RUN_AS_NODE = "1", console.warn(
    `[pick-node] No bundled or system Node found — falling back to process.execPath with ELECTRON_RUN_AS_NODE=1. Server launch may behave unexpectedly. execPath=${c.nodeBin}`
  ));
  const y = a.resolve(a.dirname(n), "..", "..", ".."), g = a.join(y, "node_modules"), v = a.join(E, "node_modules");
  u.NODE_PATH = [g, v, u.NODE_PATH || ""].filter(Boolean).join(a.delimiter);
  const h = a.join(E, "server.log");
  try {
    await Ln({
      cliPath: n,
      anchor: n,
      nodeBin: c.nodeBin,
      extraArgs: ["--port", String(e), "--pi-port", String(t)],
      env: u,
      starter: "Electron",
      stdio: { logFile: h },
      healthTimeoutMs: gs,
      port: e,
      detach: !1,
      cwd: y
    });
  } catch (m) {
    let b = "";
    try {
      b = R(h, "utf-8");
    } catch {
    }
    const S = b.split(`
`).slice(-20).join(`
`);
    let P = "unknown";
    m instanceof In || m instanceof Cn ? P = m.message : m instanceof mt ? P = `child exited (code=${m.code})` : m instanceof Error && (P = m.message);
    const O = [c.nodeBin, "--ts-loader=jiti", n, "--port", String(e), "--pi-port", String(t)];
    throw ws({
      spawnBin: c.nodeBin,
      spawnArgs: O,
      cwd: y,
      logTail: S,
      readyError: P
    });
  }
}
const wt = /* @__PURE__ */ new Set();
function bs(e) {
  return wt.add(e), () => {
    wt.delete(e);
  };
}
function Q(e) {
  for (const t of wt)
    try {
      t(e);
    } catch {
    }
}
let Se = null;
async function ot() {
  const e = X();
  return (await fe(e.port)).running;
}
async function Hn(e = 20) {
  const t = et();
  try {
    if (!w(t)) return "";
    const n = await import("node:fs/promises"), r = await n.stat(t), s = Math.max(0, r.size - 8192), i = await n.open(t, "r");
    try {
      const c = Buffer.alloc(r.size - s);
      return await i.read(c, 0, c.length, s), c.toString("utf8").split(`
`).slice(-e).join(`
`);
    } finally {
      await i.close();
    }
  } catch {
    return "";
  }
}
async function Ie(e = {}) {
  return Se || (Se = (async () => {
    try {
      Q({ phase: "starting" });
      const t = X(), n = `http://localhost:${t.port}`, r = await fe(t.port);
      if (r.running && !e.force)
        return Q({ phase: "ready", url: n }), { kind: "already-running", url: n };
      if (r.running && e.force) {
        Q({ phase: "shutting-down-existing" });
        try {
          await fetch(`${n}/api/shutdown`, { method: "POST", signal: AbortSignal.timeout(3e3) });
        } catch {
        }
        const s = Date.now() + 5e3;
        for (; Date.now() < s && (await fe(t.port)).running; )
          await new Promise((c) => setTimeout(c, 200));
      }
      Q({ phase: "spawning" });
      const o = await Un();
      return Q({ phase: "waiting-health" }), Q({ phase: "ready", url: o }), { kind: "started", url: o };
    } catch (t) {
      const n = String((t == null ? void 0 : t.message) ?? t), r = await Hn(20);
      return Q({ phase: "failed", message: n }), { kind: "failed", reason: n, logTail: r };
    } finally {
      Se = null;
    }
  })(), Se);
}
async function Ss() {
  const t = X().port;
  if (gt !== null) {
    try {
      const n = await fetch(`http://localhost:${t}/api/health`, {
        signal: AbortSignal.timeout(3e3)
      });
      if (n.ok) {
        const r = await n.json();
        if (ps({
          starter: typeof r.starter == "string" ? r.starter : void 0,
          healthPid: typeof r.pid == "number" ? r.pid : void 0,
          storedPid: gt
        }))
          try {
            await fetch(`http://localhost:${t}/api/shutdown`, { method: "POST" });
          } catch {
          }
      }
    } catch {
    }
    return;
  }
  if (Fn)
    try {
      await fetch(`http://localhost:${t}/api/shutdown`, { method: "POST" });
    } catch {
    }
}
function Gt() {
  return a.join(D.homedir(), ".pi", "agent", "settings.json");
}
function ks() {
  try {
    if (!w(Gt())) return !1;
    const e = JSON.parse(R(Gt(), "utf-8"));
    if (e != null && e.anthropicApiKey || e != null && e.openaiApiKey || e != null && e.apiKey) return !0;
    if (e != null && e.providers && typeof e.providers == "object") {
      for (const t of Object.values(e.providers))
        if (t != null && t.apiKey) return !0;
    }
  } catch {
  }
  return !1;
}
function xs(e) {
  return e ? /\b(error|fatal|EADDRINUSE|EACCES|MODULE_NOT_FOUND|ENOENT|exited|crashed|failed)\b/i.test(e) : !1;
}
function qt(e) {
  if (!e) return "";
  const t = /\u001b\[[0-?]*[ -/]*[@-~]/g, n = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, r = /\u001b[@-Z\\-_]/g;
  return e.replace(t, "").replace(n, "").replace(r, "");
}
function te(e, t = {}) {
  const n = t.timeoutMs ?? 5e3;
  try {
    return { ok: !0, stdout: Ge(e, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: n,
      env: t.env,
      cwd: t.cwd
    }).toString() };
  } catch (r) {
    return $s(r, e, n);
  }
}
function $s(e, t, n) {
  const r = e, o = r.stderr ? r.stderr.toString() : "", s = qt(o).slice(-500), i = r.stdout ? r.stdout.toString() : "", c = r.code ?? "", d = r.errno, l = r.status, f = r.signal, u = r.message || String(e);
  return c === "ENOENT" ? {
    ok: !1,
    kind: "not-found",
    message: "Command not found",
    detail: `${t}
${u}`,
    stderrTail: s || void 0,
    timeoutMs: n
  } : c === "EACCES" || c === "EPERM" ? {
    ok: !1,
    kind: "permission-denied",
    message: "Permission denied",
    detail: `${t}
${u}`,
    stderrTail: s || void 0,
    timeoutMs: n
  } : c === "ETIMEDOUT" || f === "SIGTERM" || d === -2 || /timed?\s*out/i.test(u) ? {
    ok: !1,
    kind: "timeout",
    message: `Command did not respond within ${Math.round(n / 1e3)}s`,
    detail: `${t}
Deadline: ${n}ms`,
    stderrTail: s || void 0,
    timeoutMs: n
  } : typeof l == "number" && l !== 0 ? {
    ok: !1,
    kind: "non-zero-exit",
    message: `Command exited with status ${l}`,
    detail: `${t}${i ? `
stdout: ${qt(i).slice(-200)}` : ""}`,
    exitCode: l,
    stderrTail: s || void 0,
    timeoutMs: n
  } : {
    ok: !1,
    kind: "unknown",
    message: "Command failed",
    detail: `${t}
${u}`,
    stderrTail: s || void 0,
    timeoutMs: n
  };
}
async function J(e, t, n) {
  try {
    const r = await n();
    return r.section || (r.section = t), r;
  } catch (r) {
    const o = r instanceof Error ? r : new Error(String(r)), s = (o.stack || "").split(`
`).slice(0, 4).join(`
`);
    return {
      name: e,
      section: t,
      status: "error",
      message: "Check failed to run",
      detail: `${o.message}
${s}`,
      suggestion: "This is a doctor-internal failure. Please file an issue with the Markdown export attached."
    };
  }
}
const Es = 1 * 1024 * 1024;
function yt(e, t, n) {
  try {
    return { ok: !0, value: t() };
  } catch (r) {
    const o = r instanceof Error ? r : new Error(String(r));
    return js(n.managedDir, e, o), {
      ok: !1,
      row: {
        name: `Doctor internal: ${e}`,
        section: "diagnostics",
        status: "error",
        message: "An assumed-safe operation failed",
        detail: `${o.message}
${(o.stack || "").split(`
`).slice(0, 4).join(`
`)}`,
        suggestion: "Open `~/.pi-dashboard/doctor.log` for full context, then file an issue with the Markdown export attached."
      }
    };
  }
}
function js(e, t, n) {
  try {
    const r = a.join(e, "doctor.log");
    Ds(r);
    const o = JSON.stringify({
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      label: t,
      message: n.message,
      stack: (n.stack || "").split(`
`).slice(0, 6).join(" | ")
    }) + `
`;
    an(r, o, { encoding: "utf-8" });
  } catch {
  }
}
function Ds(e) {
  try {
    if (!w(e) || cn(e).size <= Es) return;
    const n = `${e}.1`;
    try {
      Ue(e, n);
    } catch {
      try {
        w(n) && se(n, { force: !0 }), Ue(e, n);
      } catch {
      }
    }
  } catch {
  }
}
const Ps = {
  // runtime
  Electron: "runtime",
  "System Node.js": "runtime",
  "Bundled Node.js": "runtime",
  "Bundled npm": "runtime",
  "Managed Node runtime": "runtime",
  // pi-tooling
  "pi CLI": "pi-tooling",
  "openspec CLI": "pi-tooling",
  // server
  "Dashboard server code": "server",
  "Offline packages bundle": "server",
  "TypeScript loader": "server",
  "Dashboard server": "server",
  "Server starter": "server",
  "Installable list": "server",
  "Server log (~/.pi-dashboard/server.log)": "server",
  "Server launch test": "server",
  // setup
  "Setup wizard": "setup",
  "API key": "setup",
  // diagnostics
  "Managed install (~/.pi-dashboard)": "diagnostics"
}, Kt = "Reinstall **PI Dashboard** or run the setup wizard from the App menu (Help → Setup).";
function ke(e, t, n = 5) {
  switch (t) {
    case "not-found":
      return `${e} binary missing. Reinstall **PI Dashboard** or check your PATH.`;
    case "permission-denied":
      return `${e} binary not executable. On Linux run \`chmod +x <path>\`; on macOS run \`xattr -cr <Resources>\` to clear quarantine.`;
    case "timeout":
      return `${e} did not respond within ${n}s. Antivirus or endpoint security is likely scanning the binary on first launch — wait 30s and re-run, or whitelist the app.`;
    case "non-zero-exit":
      return `${e} executed but reported failure. ${Kt}`;
    default:
      return `${e} failed for an unknown reason. ${Kt}`;
  }
}
const As = {
  Electron: () => {
  },
  // never fails today
  "System Node.js": (e) => e === "ok" ? void 0 : "System Node.js not on PATH. The bundled runtime will be used; this is fine for most users. To install, see [nodejs.org](https://nodejs.org).",
  "Bundled Node.js": (e, t, n) => e === "ok" ? void 0 : ke("Bundled Node", n, 15),
  "Bundled npm": (e, t, n) => e === "ok" ? void 0 : ke("Bundled npm", n, 5),
  "Managed Node runtime": (e) => e === "ok" ? void 0 : "Managed Node runtime missing under `~/.pi-dashboard/node`. Re-run the setup wizard (Help → Setup).",
  "pi CLI": (e, t, n) => e === "ok" ? void 0 : n ? ke("pi CLI", n, 5) : "`pi` not found. Run the setup wizard (Help → Setup) to install it under `~/.pi-dashboard`.",
  "openspec CLI": (e, t, n) => e === "ok" ? void 0 : n ? ke("openspec CLI", n, 5) : "`openspec` not found. Optional, but required for OpenSpec workflows. Run the setup wizard.",
  "Dashboard server code": (e) => e === "ok" ? void 0 : "Dashboard server code not found in app resources. Reinstall **PI Dashboard**.",
  "Offline packages bundle": (e) => e === "ok" ? void 0 : "Offline packages bundle absent. First-run install will require network access to `registry.npmjs.org`.",
  "TypeScript loader": (e) => e === "ok" ? void 0 : "No TypeScript loader (jiti or tsx) found. Required to run the dashboard server. Run the setup wizard (Help → Setup).",
  "Dashboard server": (e) => e === "ok" ? void 0 : "Dashboard server not running on `http://localhost:8000`. It will be started automatically when needed.",
  "Server starter": (e) => e === "ok" ? void 0 : "Server starter unknown — older server build. Restart the server.",
  "Installable list": (e) => e === "ok" ? void 0 : "Some installable packages failed to install. Check `~/.pi-dashboard/server.log` for details.",
  "Server log (~/.pi-dashboard/server.log)": (e) => e === "ok" ? void 0 : "Server log contains error markers — inspect the log for full context.",
  "Server launch test": (e, t, n) => e === "ok" ? void 0 : n ? ke("Server launch test", n, 15) : "Server failed to start during the doctor's test launch. Check `detail` for the captured stderr.",
  "Setup wizard": (e) => e === "ok" ? void 0 : "Setup wizard has not completed. Open **Help → Setup** in the app menu.",
  "API key": (e) => e === "ok" ? void 0 : "No API key configured. Pi sessions need an LLM provider key. Configure one in **Settings → Providers**.",
  "Managed install (~/.pi-dashboard)": (e) => e === "ok" ? void 0 : "Managed install incomplete. Run the setup wizard (**Help → Setup**) to finish first-run install."
};
async function Rs(e) {
  const t = [], n = e.managedDir;
  t.push(
    await J("System Node.js", "runtime", () => {
      const r = e.detectSystemNode();
      if (!r.found)
        return {
          name: "System Node.js",
          section: "runtime",
          status: "warning",
          message: "Not found on PATH (bundled Node will be used)",
          detail: "PATH searched without success"
        };
      const o = te(`"${r.path}" --version`, { timeoutMs: 5e3 });
      return o.ok ? {
        name: "System Node.js",
        section: "runtime",
        status: "ok",
        message: `${o.stdout.trim()} at ${r.path}`
      } : {
        name: "System Node.js",
        section: "runtime",
        status: "warning",
        message: o.message,
        detail: `${o.detail}${o.stderrTail ? `
stderr: ${o.stderrTail}` : ""}`,
        kind: o.kind
      };
    })
  ), t.push(
    await J("pi CLI", "pi-tooling", () => {
      const r = e.detectPi();
      if (!r.found || !r.path)
        return {
          name: "pi CLI",
          section: "pi-tooling",
          status: "error",
          message: "Not found — required to run agent sessions",
          detail: "Searched system PATH and managed install",
          fixable: !0
        };
      const o = te(`"${r.path}" --version`, { timeoutMs: 5e3 });
      return {
        name: "pi CLI",
        section: "pi-tooling",
        status: "ok",
        message: `${o.ok ? o.stdout.trim() : "?"} (${r.source ?? "unknown"}) at ${r.path}`
      };
    })
  ), t.push(
    await J("openspec CLI", "pi-tooling", () => {
      const r = e.detectOpenSpec();
      if (!r.found || !r.path)
        return {
          name: "openspec CLI",
          section: "pi-tooling",
          status: "warning",
          message: "Not found — optional, needed for OpenSpec workflows",
          detail: "Searched system PATH and managed install",
          fixable: !0
        };
      const o = te(`"${r.path}" --version`, { timeoutMs: 5e3 });
      return {
        name: "openspec CLI",
        section: "pi-tooling",
        status: "ok",
        message: `${o.ok ? o.stdout.trim() : "?"} (${r.source ?? "unknown"}) at ${r.path}`
      };
    })
  ), t.push(
    await J("TypeScript loader", "server", () => {
      const r = a.join(n, "node_modules", "jiti", "package.json"), o = a.join(n, "node_modules", "tsx", "package.json");
      function s(u) {
        try {
          return w(u) && JSON.parse(R(u, "utf-8")).version || null;
        } catch {
          return null;
        }
      }
      const i = s(r), c = s(o);
      let d = null;
      const l = process.platform === "win32" ? "where tsx" : "which tsx", f = te(l, { timeoutMs: 5e3 });
      return f.ok && (d = f.stdout.trim().split(`
`)[0] || null), i ? {
        name: "TypeScript loader",
        section: "server",
        status: "ok",
        message: `jiti v${i} (managed) at ${a.dirname(r)}`
      } : c ? {
        name: "TypeScript loader",
        section: "server",
        status: "ok",
        message: `tsx v${c} (managed) at ${a.dirname(o)}`
      } : d ? {
        name: "TypeScript loader",
        section: "server",
        status: "ok",
        message: `tsx (system) at ${d}`
      } : {
        name: "TypeScript loader",
        section: "server",
        status: "error",
        message: "Not found — required to run the dashboard server",
        detail: `Looked under ${r}, ${o}, and on PATH`,
        fixable: !0
      };
    })
  ), t.push(
    await J("Dashboard server", "server", async () => {
      if (!e.probeServer)
        return {
          name: "Dashboard server",
          section: "server",
          status: "warning",
          message: "Not probed (no probe configured)",
          detail: "deps.probeServer was not provided"
        };
      const r = await e.probeServer();
      return r.running ? {
        name: "Dashboard server",
        section: "server",
        status: "ok",
        message: `Running${r.version ? " v" + r.version : ""}${r.mode ? " (" + r.mode + " mode)" : ""} at http://localhost:8000`
      } : {
        name: "Dashboard server",
        section: "server",
        status: "warning",
        message: "Not running — will be started automatically when needed",
        detail: "GET http://localhost:8000/api/health returned no response"
      };
    })
  );
  {
    const r = a.join(n, "server.log"), o = yt(
      "read server.log tail",
      () => w(r) ? R(r, "utf-8").split(`
`).slice(-10).join(`
`).trim() : null,
      { managedDir: n }
    );
    if (!o.ok)
      t.push(o.row);
    else if (o.value) {
      const s = xs(o.value);
      t.push({
        name: "Server log (~/.pi-dashboard/server.log)",
        section: "server",
        status: s ? "warning" : "ok",
        message: s ? "Recent errors detected:" : "Last entries:",
        detail: o.value
      });
    }
  }
  return e.isApiKeyConfigured && t.push(
    await J("API key", "setup", () => {
      const r = e.isApiKeyConfigured();
      return {
        name: "API key",
        section: "setup",
        status: r ? "ok" : "warning",
        message: r ? "Configured in pi settings" : "Not configured — pi sessions will need a key to use LLM providers",
        detail: r ? void 0 : "Looked at ~/.pi/agent/settings.json (anthropicApiKey / openaiApiKey / providers[].apiKey)"
      };
    })
  ), t.push(
    await J("Managed install (~/.pi-dashboard)", "diagnostics", () => {
      const r = w(n), o = w(a.join(n, "node_modules")), s = r && o;
      return {
        name: "Managed install (~/.pi-dashboard)",
        section: "diagnostics",
        status: s ? "ok" : "warning",
        message: r ? o ? `Exists with node_modules at ${n}` : "Exists but no node_modules — may need reinstall" : "Not created yet — will be set up on first run",
        detail: s ? void 0 : `Path: ${n}`
      };
    })
  ), t;
}
function Ns(e) {
  for (const t of e) {
    if (!t.section) {
      const n = Ps[t.name];
      n ? t.section = n : t.section = "diagnostics";
    }
    if (t.status !== "ok" && !t.suggestion) {
      const n = As[t.name], r = n == null ? void 0 : n(t.status, t.detail, t.kind);
      r && (t.suggestion = r);
    }
  }
  return e;
}
function st(e) {
  try {
    return w(e) && JSON.parse(R(e, "utf-8")).version || null;
  } catch {
    return null;
  }
}
async function Ts(e) {
  const t = Ot, n = K(), r = E, o = n ? process.platform === "win32" ? a.dirname(n) : a.dirname(a.dirname(n)) : null;
  let s;
  try {
    const f = await t({ bundledNodeDir: o, managedDir: r });
    f.ok || (s = f.error);
  } catch (f) {
    s = f instanceof Error ? f.message : String(f);
  }
  const i = process.platform === "win32" ? a.join(r, "node", "node.exe") : a.join(r, "node", "bin", "node"), c = a.join(r, "node", ".version"), d = w(i), l = w(c) && R(c, "utf-8").trim() || null;
  return s ? {
    name: "Managed Node runtime",
    section: "runtime",
    status: "warning",
    message: `Failed to install: ${s}`,
    detail: `Target: ${a.join(r, "node")}`,
    fixable: !0
  } : !d && !o ? {
    name: "Managed Node runtime",
    section: "runtime",
    status: "warning",
    message: "Not installed (no bundled source — standalone CLI install)",
    detail: `System Node will be used. Target: ${a.join(r, "node")}`
  } : d ? {
    name: "Managed Node runtime",
    section: "runtime",
    status: "ok",
    message: `${l || "installed"} at ${a.join(r, "node")}`
  } : {
    name: "Managed Node runtime",
    section: "runtime",
    status: "error",
    message: "Install attempted but binary not found",
    detail: `Target: ${i}`,
    fixable: !0
  };
}
function Yt() {
  const e = te("curl -sf http://localhost:8000/api/health 2>/dev/null", { timeoutMs: 3e3 });
  if (!e.ok || !e.stdout.trim()) return Promise.resolve({ running: !1 });
  try {
    const t = JSON.parse(e.stdout);
    return Promise.resolve({
      running: !0,
      version: typeof t.version == "string" ? t.version : void 0,
      mode: typeof t.mode == "string" ? t.mode : void 0,
      starter: typeof t.starter == "string" ? t.starter : null,
      installable: t.installable && typeof t.installable == "object" ? {
        total: t.installable.total ?? 0,
        installed: t.installable.installed ?? 0,
        failed: Array.isArray(t.installable.failed) ? t.installable.failed : []
      } : null
    });
  } catch {
    return Promise.resolve({ running: !0 });
  }
}
async function _s() {
  try {
    return await Os();
  } catch (e) {
    const t = e instanceof Error ? e : new Error(String(e));
    return {
      checks: [{
        name: "Doctor failed to produce a report",
        section: "diagnostics",
        status: "error",
        message: "Unexpected internal failure",
        detail: `${t.message}
${(t.stack || "").split(`
`).slice(0, 4).join(`
`)}`,
        suggestion: "Open `~/.pi-dashboard/doctor.log` for full context, then file an issue with the captured error attached."
      }],
      summary: { ok: 0, warnings: 0, errors: 1 },
      generatedAt: Date.now()
    };
  }
}
async function Os() {
  const e = [], t = yt("app.getVersion()", () => j.getVersion(), {
    managedDir: E
  }), n = t.ok ? t.value : "unknown";
  t.ok || e.push(t.row);
  const r = process.versions.electron || "unknown", o = process.versions.chrome || "unknown";
  e.push({
    name: "Electron",
    section: "runtime",
    status: "ok",
    message: `${r} (Chromium ${o})`,
    detail: `App version: ${n}, Platform: ${process.platform} ${process.arch}`
  });
  const s = K();
  e.push(
    await J("Bundled Node.js", "runtime", () => {
      const h = ne().found;
      if (!s)
        return {
          name: "Bundled Node.js",
          section: "runtime",
          status: h ? "warning" : "error",
          message: "Not found in app resources",
          detail: `Searched ${process.resourcesPath ?? "(no resourcesPath)"}`,
          fixable: !h
        };
      const m = te(`"${s}" --version`, { timeoutMs: 15e3 });
      return m.ok ? {
        name: "Bundled Node.js",
        section: "runtime",
        status: "ok",
        message: `${m.stdout.trim()} at ${s}`
      } : {
        name: "Bundled Node.js",
        section: "runtime",
        status: "error",
        message: {
          "not-found": "Bundled Node binary missing from app resources",
          "permission-denied": "Bundled Node binary not executable",
          timeout: "Bundled Node hung during version probe (15s deadline exceeded)",
          "non-zero-exit": "Bundled Node executed but reported failure",
          unknown: "Bundled Node failed for an unknown reason"
        }[m.kind] ?? "Bundled Node failed",
        detail: `${m.detail}${m.stderrTail ? `
stderr: ${m.stderrTail}` : ""}`,
        kind: m.kind
      };
    })
  );
  const i = Dn();
  e.push(
    await J("Bundled npm", "runtime", () => {
      if (!i)
        return {
          name: "Bundled npm",
          section: "runtime",
          status: ne().found ? "warning" : "error",
          message: "Not found in app resources",
          detail: `Searched ${process.resourcesPath ?? "(no resourcesPath)"}`
        };
      const h = a.join(a.dirname(i), "..", "package.json");
      return {
        name: "Bundled npm",
        section: "runtime",
        status: "ok",
        message: `${st(h) || "installed"} at ${i}`
      };
    })
  ), e.push(await Ts());
  const c = await Rs({
    managedDir: E,
    detectSystemNode: () => {
      const h = ne();
      return { found: h.found, path: h.path };
    },
    detectPi: () => {
      const h = Xe();
      return { found: h.found, path: h.path, source: h.source };
    },
    detectOpenSpec: () => {
      const h = $n();
      return { found: h.found, path: h.path, source: h.source };
    },
    probeServer: Yt,
    isApiKeyConfigured: ks
  });
  for (const h of c) e.push(h);
  const d = process.resourcesPath, l = d ? a.join(d, "server", "packages", "server", "src", "cli.ts") : null, f = !!(l && w(l)), u = jn();
  let p = null;
  if (u.found && u.path && (p = st(u.path)), f && !p && d) {
    const h = a.join(d, "server", "packages", "server", "package.json");
    p = st(h);
  }
  e.push({
    name: "Dashboard server code",
    section: "server",
    status: f || u.found ? "ok" : "error",
    message: f ? `v${p || "?"} (bundled) at ${l}` : u.found ? `v${p || "?"} (${u.source}) at ${a.dirname(u.path)}` : "Not found — required for the dashboard server",
    fixable: !f && !u.found
  });
  const y = yt(
    "resolveOfflinePackages",
    () => d ? Pn(d) : { present: !1, reason: "no resourcesPath" },
    { managedDir: E }
  );
  if (!y.ok)
    e.push(y.row);
  else {
    const h = y.value;
    if (h.present) {
      const m = h.manifest, b = m.packages.map((S) => `${S.name.split("/").pop()}@${S.version}`).join(", ");
      e.push({
        name: "Offline packages bundle",
        section: "server",
        status: "ok",
        message: `Present (target=${m.targetPlatform}, ${m.packages.length} pinned)`,
        detail: `${b} — bundled ${m.bundledAt}, sha256 ${m.sha256.slice(0, 12)}…`
      });
    } else
      e.push({
        name: "Offline packages bundle",
        section: "server",
        status: "warning",
        message: "Not bundled (registry-install mode)",
        detail: `First-run will require network access to registry.npmjs.org. Reason: ${h.reason}`
      });
  }
  const g = await Yt();
  if (g.running && (e.push({
    name: "Server starter",
    section: "server",
    status: g.starter ? "ok" : "warning",
    message: g.starter ?? "Unknown (old server?)"
  }), g.installable)) {
    const h = g.installable.failed.length;
    e.push({
      name: "Installable list",
      section: "server",
      status: h > 0 ? "error" : "ok",
      message: `${g.installable.installed}/${g.installable.total} installed` + (h > 0 ? `, ${h} failed: ${g.installable.failed.join(", ")}` : ""),
      fixable: h > 0
    });
  }
  g.running || await Ms(e, { hasBundledServer: f, bundledServerCli: l, bundledNode: s }), Ns(e);
  const v = {
    ok: e.filter((h) => h.status === "ok").length,
    warnings: e.filter((h) => h.status === "warning").length,
    errors: e.filter((h) => h.status === "error").length
  };
  return { checks: e, summary: v, generatedAt: Date.now() };
}
async function Ms(e, t) {
  const { hasBundledServer: n, bundledServerCli: r, bundledNode: o } = t, s = n ? r : null, c = new G({}).resolveJiti({ anchor: s ?? void 0 }), l = Mt({
    bundledNodeDir: wo(),
    systemNode: ne(),
    processExecPath: process.execPath,
    platform: process.platform
  }).nodeBin;
  if (!s || !c) {
    e.push({
      name: "Server launch test",
      section: "server",
      status: "error",
      message: "Cannot test launch — missing components",
      detail: [s ? null : "No server CLI", c ? null : "No jiti loader (install pi)"].filter(Boolean).join(", ")
    });
    return;
  }
  const f = [o ? a.dirname(o) : null].filter(Boolean), u = { ...process.env, PATH: `${f.join(a.delimiter)}${a.delimiter}${process.env.PATH ?? ""}` }, p = JSON.stringify(s), y = `"${l}" --import "${c}" -e "import ${p.replace(/"/g, '\\"')}; setTimeout(() => process.exit(0), 100)"`, g = te(y, { timeoutMs: 15e3, env: u });
  if (g.ok) {
    e.push({
      name: "Server launch test",
      section: "server",
      status: "ok",
      message: "Server launches cleanly"
    });
    return;
  }
  const v = {
    "not-found": "Server launch test: jiti or server CLI binary missing",
    "permission-denied": "Server launch test: binary not executable",
    timeout: "Server hung during launch test (15s deadline exceeded)",
    "non-zero-exit": "Server fails to start",
    unknown: "Server launch test failed for an unknown reason"
  };
  e.push({
    name: "Server launch test",
    section: "server",
    status: "error",
    message: v[g.kind] ?? "Server launch test failed",
    detail: `${g.detail}${g.stderrTail ? `
stderr: ${g.stderrTail}` : ""}`,
    kind: g.kind
  });
}
function Ct(e) {
  const t = [], n = [], r = a.join(e, "node_modules");
  if (w(r)) {
    let o;
    try {
      o = re(r, { withFileTypes: !0 });
    } catch {
      o = [];
    }
    for (const s of o)
      if (!s.name.startsWith(".") && s.isDirectory())
        if (s.name.startsWith("@")) {
          const i = a.join(r, s.name);
          let c;
          try {
            c = re(i, { withFileTypes: !0 });
          } catch {
            continue;
          }
          for (const d of c) {
            if (d.name.startsWith(".") || !d.isDirectory()) continue;
            const l = `${s.name}/${d.name}`, f = a.join(i, d.name);
            Re.has(l) ? t.push(f) : n.push(f);
          }
        } else {
          const i = a.join(r, s.name);
          Re.has(s.name) ? t.push(i) : n.push(i);
        }
  }
  return t.push(a.join(e, "node")), t.push(a.join(e, ".offline-cache")), { wipe: t, preserve: n };
}
async function Is(e) {
  const { managedDir: t, bundledNodeDir: n, installStandalone: r, onProgress: o } = e, s = Ct(t), i = a.resolve(t), c = [];
  for (const l of s.wipe) {
    const f = a.resolve(l), u = a.relative(i, f);
    (u.startsWith("..") || a.isAbsolute(u)) && c.push(f);
  }
  if (c.length > 0)
    return {
      ok: !1,
      wiped: [],
      preserved: s.preserve,
      error: `Refusing to wipe paths outside managed dir: ${c.join(", ")}`
    };
  const d = [];
  for (const l of s.wipe) {
    o == null || o(`Wiping ${l}…`);
    try {
      se(l, { recursive: !0, force: !0 }), d.push(l);
    } catch (f) {
      return {
        ok: !1,
        wiped: d,
        preserved: s.preserve,
        error: `Failed to wipe ${l}: ${(f == null ? void 0 : f.message) ?? f}`
      };
    }
  }
  if (n) {
    o == null || o("Restoring bundled Node runtime…");
    try {
      await Ot({
        managedDir: t,
        bundledNodeDir: n,
        progress: (l) => o == null ? void 0 : o(`node-runtime: ${l.status}${l.output ? ` (${l.output})` : ""}`)
      });
    } catch (l) {
      o == null || o(`Bundled Node restore warning: ${(l == null ? void 0 : l.message) ?? l}`);
    }
  }
  o == null || o("Reinstalling packages…");
  try {
    await r((l) => {
      l.output ? o == null || o(`${l.step}: ${l.output}`) : o == null || o(`${l.step}: ${l.status}`);
    });
  } catch (l) {
    return {
      ok: !1,
      wiped: d,
      preserved: s.preserve,
      error: `Reinstall failed: ${(l == null ? void 0 : l.message) ?? l}`
    };
  }
  return {
    ok: !0,
    wiped: d,
    preserved: s.preserve
  };
}
const Vn = a.dirname(pe(import.meta.url));
let C = null, Xt = !1, xe = null;
function Cs() {
  const e = a.join(Vn, "preload.js");
  if (w(e)) return e;
  const t = a.join(process.cwd(), ".vite", "build", "preload.js");
  return w(t) ? t : e;
}
function Ls() {
  let e = a.join(Vn, "..", "renderer", "doctor.html");
  return !w(e) && process.resourcesPath && (e = a.join(process.resourcesPath, "renderer", "doctor.html")), e;
}
function Bs() {
  Xt || (Xt = !0, $.handle("doctor:run", async () => {
    if (xe)
      return xe;
    xe = (async () => {
      try {
        return await _s();
      } finally {
      }
    })();
    try {
      return await xe;
    } finally {
      xe = null;
    }
  }), $.handle("doctor:open-log", async () => {
    try {
      const e = et();
      return w(e) ? (await Ae.openPath(e), { ok: !0, path: e }) : { ok: !1, path: e };
    } catch (e) {
      throw ce(e, "open-log");
    }
  }), $.handle("doctor:open-doctor-log", async () => {
    try {
      const e = a.join(E, "doctor.log");
      return w(e) ? (await Ae.openPath(e), { ok: !0, exists: !0, path: e }) : { ok: !0, exists: !1 };
    } catch (e) {
      throw ce(e, "open-doctor-log");
    }
  }), $.handle("doctor:run-setup", async () => {
    try {
      Pe();
      return;
    } catch (e) {
      throw ce(e, "run-setup");
    }
  }), $.handle("doctor:copy", async (e, t) => {
    try {
      return or.writeText(typeof t == "string" ? t : ""), { ok: !0 };
    } catch (n) {
      throw ce(n, "copy");
    }
  }), $.handle("doctor:open-managed-dir", async () => {
    try {
      return await Ae.openPath(E), { ok: !0, path: E };
    } catch (e) {
      throw ce(e, "open-managed-dir");
    }
  }), $.handle("doctor:plan-safe-wipe", async () => {
    try {
      const e = Ct(E);
      return { wipe: e.wipe, preserve: e.preserve, managedDir: E };
    } catch (e) {
      throw ce(e, "plan-safe-wipe");
    }
  }));
}
function ce(e, t) {
  const n = e instanceof Error ? e : new Error(String(e));
  return {
    kind: t,
    message: n.message,
    detail: (n.stack || "").split(`
`).slice(0, 4).join(`
`)
  };
}
function Fs() {
  return Bs(), C && !C.isDestroyed() ? (C.isMinimized() && C.restore(), C.focus(), C) : (C = new W({
    width: 1e3,
    height: 720,
    resizable: !0,
    title: "PI Dashboard Doctor",
    webPreferences: {
      nodeIntegration: !1,
      contextIsolation: !0,
      preload: Cs()
    }
  }), C.loadFile(Ls()), C.on("closed", () => {
    C = null;
  }), C);
}
function Zt() {
  H.showMessageBox({
    type: "info",
    title: `About ${j.name}`,
    message: `${j.name}`,
    detail: `Version ${j.getVersion()}

Monitor and interact with pi agent sessions.

© Blackbelt Technology`
  });
}
async function Je() {
  Fs();
}
function zs() {
  if (process.platform === "darwin") {
    const t = [
      {
        label: j.name,
        submenu: [
          { label: `About ${j.name}`, click: () => Zt() },
          { type: "separator" },
          { label: "Doctor...", click: () => Je() },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" }
        ]
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" }
        ]
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" }
        ]
      },
      {
        label: "Window",
        submenu: [
          { role: "minimize" },
          { role: "zoom" },
          { type: "separator" },
          { role: "front" },
          { role: "close" }
        ]
      }
    ];
    je.setApplicationMenu(je.buildFromTemplate(t));
    return;
  }
  const e = [
    {
      label: "View",
      submenu: [
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => {
          var t;
          return (t = W.getFocusedWindow()) == null ? void 0 : t.webContents.reload();
        } },
        { label: "Force Reload", accelerator: "CmdOrCtrl+Shift+R", click: () => {
          var t;
          return (t = W.getFocusedWindow()) == null ? void 0 : t.webContents.reloadIgnoringCache();
        } },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "About",
      click: () => Zt()
    },
    {
      label: "Doctor",
      click: () => Je()
    }
  ];
  je.setApplicationMenu(je.buildFromTemplate(e));
}
function Us(e, t, n) {
  const r = a.join(
    t,
    "node_modules",
    ...e.split("/"),
    "package.json"
  );
  if (!T.existsSync(r)) return !1;
  let o;
  try {
    o = JSON.parse(T.readFileSync(r, "utf8"));
  } catch {
    return !1;
  }
  return !0;
}
function it(e = E) {
  for (const t of Re)
    if (!Us(t, e)) return !1;
  return !0;
}
function Hs(e) {
  return e.managedPopulated ? e.preflightNeedsAction ? { kind: "preflight-install" } : { kind: "skip" } : { kind: "wizard" };
}
const We = a.join(D.homedir(), ".pi-dashboard", "window-state.json"), Oe = { width: 1280, height: 800 };
function Jn() {
  try {
    if (!w(We)) return { ...Oe };
    const e = JSON.parse(R(We, "utf-8")), t = {
      x: typeof e.x == "number" ? e.x : void 0,
      y: typeof e.y == "number" ? e.y : void 0,
      width: typeof e.width == "number" ? e.width : Oe.width,
      height: typeof e.height == "number" ? e.height : Oe.height,
      isMaximized: e.isMaximized === !0
    };
    return t.x !== void 0 && t.y !== void 0 && !Vs(t.x, t.y, t.width, t.height) && (t.x = void 0, t.y = void 0), t;
  } catch {
    return { ...Oe };
  }
}
function Vs(e, t, n, r) {
  try {
    const o = sr.getAllDisplays();
    for (const s of o) {
      const i = s.workArea, c = Math.max(e, i.x), d = Math.max(t, i.y), l = Math.min(e + n, i.x + i.width) - c, f = Math.min(t + r, i.y + i.height) - d;
      if (l >= 50 && f >= 50) return !0;
    }
    return !1;
  } catch {
    return !0;
  }
}
function Qt(e) {
  const t = e.isMaximized(), n = t ? Jn() : e.getBounds(), r = {
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
    isMaximized: t
  };
  try {
    V(a.dirname(We), { recursive: !0 }), he(We, JSON.stringify(r, null, 2));
  } catch {
  }
}
const Js = a.dirname(pe(import.meta.url));
let U = null, Ce = null, vt = null;
function at(e) {
  return j.isPackaged ? a.join(process.resourcesPath, e) : a.join(Js, "..", "..", "resources", e);
}
function Ws(e) {
  const t = [];
  return e.isRunning === !0 ? t.push({ label: "Restart server", click: () => e.onLaunch(!0) }) : e.isRunning === !1 && t.push({ label: "Start server", click: () => e.onLaunch(!1) }), t.length > 0 && t.push({ type: "separator" }), t.push({ label: "Show", click: e.onShow }), t.push({ type: "separator" }), t.push({ label: "Quit", click: e.onQuit }), t;
}
function ct(e, t, n) {
  let r;
  process.platform === "darwin" ? (r = nt.createFromPath(at("trayTemplate.png")), r.setTemplateImage(!0)) : process.platform === "win32" ? r = nt.createFromPath(at("icon.ico")) : r = nt.createFromPath(at("icon.png")), U = new ir(r), U.setToolTip("PI Dashboard");
  const o = () => {
    const i = e();
    i && (i.show(), i.focus());
  }, s = (i) => {
    if (!U) return;
    const c = Ws({
      isRunning: i,
      onLaunch: (n == null ? void 0 : n.onLaunch) ?? (() => {
      }),
      onShow: o,
      onQuit: t
    });
    U.setContextMenu(je.buildFromTemplate(c));
  };
  if (s(n ? null : !1), n) {
    const i = async () => {
      try {
        const c = await n.getServerStatus();
        c !== vt && (vt = c, s(c));
      } catch {
      }
    };
    i(), Ce = setInterval(() => {
      i();
    }, 3e3);
  }
  return U.on("click", o), U;
}
function Gs() {
  Ce && (clearInterval(Ce), Ce = null), vt = null, U == null || U.destroy(), U = null;
}
const qs = 1440 * 60 * 1e3, Ks = [
  "@earendil-works/pi-coding-agent",
  "@mariozechner/pi-coding-agent",
  "@fission-ai/openspec"
];
async function Ys(e) {
  try {
    const t = await fetch(`http://localhost:${e}/api/health`, {
      signal: AbortSignal.timeout(3e3)
    });
    if (!t.ok) return null;
    const n = await t.json();
    return typeof n.starter == "string" ? n.starter : null;
  } catch {
    return null;
  }
}
function Xs(e) {
  const t = [];
  if (e === "Bridge") return t;
  for (const n of Ks) {
    const r = e === "Standalone" ? Qs(n) : Zs(n);
    r && t.push(r);
  }
  return t;
}
function Zs(e) {
  const t = a.join(D.homedir(), ".pi-dashboard"), n = eo({ cwd: t, pkg: e });
  return Wn(e, n);
}
function Qs(e) {
  const t = to({ pkg: e });
  return Wn(e, t);
}
function Wn(e, t) {
  if (!t) return null;
  const n = t[e];
  return n != null && n.current && (n != null && n.latest) && n.current !== n.latest ? { name: e, current: n.current, latest: n.latest } : null;
}
function ei(e, t) {
  if (t === "Standalone") {
    const n = Zr({ pkg: e, version: "latest" });
    if (!n.ok) throw new Error(`npm install -g failed: ${JSON.stringify(n.error)}`);
  } else {
    const n = a.join(D.homedir(), ".pi-dashboard"), r = Xr({ cwd: n, pkg: e, version: "latest" });
    if (!r.ok) throw new Error(`npm install failed: ${JSON.stringify(r.error)}`);
  }
}
function ti(e) {
  const t = X(), n = async () => {
    const s = await Ys(t.port);
    if (s === "Bridge") return;
    const i = Xs(s);
    i.length > 0 && e(i, s);
  }, r = setTimeout(() => void n(), 3e4), o = setInterval(() => void n(), qs);
  return () => {
    clearTimeout(r), clearInterval(o);
  };
}
let lt = !1;
function ni(e, t) {
  if (lt) return;
  const n = e.map((s) => s.name.split("/").pop()).join(", "), r = e.map((s) => `${s.name.split("/").pop()}: ${s.current} → ${s.latest}`).join(`
`), o = new Bt({
    title: "PI Dashboard: Updates Available",
    body: `${n}
${r}`,
    actions: [{ type: "button", text: "Update" }]
  });
  o.on("action", async () => {
    if ((await H.showMessageBox({
      type: "question",
      title: "Update Dependencies",
      message: `Update ${n}?`,
      detail: r,
      buttons: ["Update", "Cancel"],
      defaultId: 0
    })).response === 0) {
      for (const i of e)
        try {
          ei(i.name, t ?? null);
        } catch (c) {
          H.showErrorBox("Update Failed", `Failed to update ${i.name}: ${c.message}`);
        }
      new Bt({
        title: "PI Dashboard",
        body: "Dependencies updated successfully."
      }).show();
    }
  }), o.on("close", () => {
    lt = !0, setTimeout(() => {
      lt = !1;
    }, 1440 * 60 * 1e3);
  }), o.show();
}
const ri = 1440 * 60 * 1e3;
let ut = null;
function oi(e) {
  if (process.env.ELECTRON_DEV || !process.resourcesPath)
    return () => {
    };
  let t;
  try {
    t = require("electron-updater").autoUpdater;
  } catch {
    return () => {
    };
  }
  t.autoDownload = !1, t.autoInstallOnAppQuit = !0, t.on("update-available", (r) => {
    e.onUpdateAvailable(r.version);
  }), t.on("update-downloaded", (r) => {
    e.onUpdateDownloaded(r.version);
  }), t.on("error", (r) => {
  });
  const n = setTimeout(() => {
    t.checkForUpdates().catch(() => {
    });
  }, 6e4);
  return ut = setInterval(() => {
    t.checkForUpdates().catch(() => {
    });
  }, ri), () => {
    clearTimeout(n), ut && clearInterval(ut);
  };
}
function en() {
  try {
    const { autoUpdater: e } = require("electron-updater");
    e.quitAndInstall();
  } catch {
  }
}
function si(e) {
  const t = e.LAUNCH_SOURCE_V2;
  return t === void 0 ? !0 : t === "true" || t === "1";
}
function ii(e) {
  const t = [], n = [], r = a.join(e, "mode.json");
  if (w(r))
    try {
      se(r, { force: !0 }), t.push(r);
    } catch (o) {
      const s = o instanceof Error ? o.message : String(o);
      n.push({ path: r, message: s });
    }
  return { removed: t, errors: n };
}
const ai = ["node", "node-pending", "node-old"], Gn = ".version", ci = [
  /config/i,
  // *config*
  "mode.json",
  "recommended-wizard.json",
  "api-key.json"
];
function Lt(e) {
  return {
    existsSync: (e == null ? void 0 : e.existsSync) ?? w,
    readFileSync: (e == null ? void 0 : e.readFileSync) ?? ((t, n) => R(t, n)),
    writeFileSync: (e == null ? void 0 : e.writeFileSync) ?? he,
    mkdirSync: (e == null ? void 0 : e.mkdirSync) ?? ((t, n) => V(t, n ?? {})),
    readdirSync: (e == null ? void 0 : e.readdirSync) ?? ((t) => re(t)),
    renameSync: (e == null ? void 0 : e.renameSync) ?? Ue,
    rmSync: (e == null ? void 0 : e.rmSync) ?? se,
    statSync: (e == null ? void 0 : e.statSync) ?? cn,
    cpSync: (e == null ? void 0 : e.cpSync) ?? ((t, n, r) => $t(t, n, r))
  };
}
function li(e) {
  return ci.some(
    (t) => typeof t == "string" ? e === t : t.test(e)
  );
}
function ui(e, t, n) {
  const r = Lt(n);
  if (!r.existsSync(e)) return !0;
  const o = a.join(e, Gn);
  if (!r.existsSync(o)) return !0;
  try {
    return r.readFileSync(o, "utf-8").trim() !== t.trim();
  } catch {
    return !0;
  }
}
function di(e, t, n) {
  const r = Lt(n);
  if (!r.existsSync(e)) return [];
  let o;
  try {
    o = r.readdirSync(e);
  } catch {
    return [];
  }
  const s = [];
  for (const i of o)
    li(i) && (r.mkdirSync(t, { recursive: !0 }), r.renameSync(a.join(e, i), a.join(t, i)), s.push(i));
  return s;
}
function fi(e, t, n, r, o) {
  const s = Lt(o);
  r && di(e, r, o), s.mkdirSync(e, { recursive: !0 });
  const i = new Set(ai);
  let c;
  try {
    c = s.readdirSync(e);
  } catch {
    c = [];
  }
  for (const d of c)
    i.has(d) || s.rmSync(a.join(e, d), { recursive: !0, force: !0 });
  if (!s.existsSync(t))
    throw new Error("Bundle source directory not found: " + t);
  s.cpSync(t, e, { recursive: !0 }), s.writeFileSync(a.join(e, Gn), n);
}
const pi = /* @__PURE__ */ new Set([
  "attach",
  "devMonorepo",
  "piExtension",
  "npmGlobal",
  "extracted"
]);
class qn extends Error {
  constructor(t) {
    super(
      `Pinned source "${t}" is not available. Check DASHBOARD_PREFER_SOURCE or remove the override.`
    ), this.sourceKind = t, this.name = "PinnedSourceUnavailableError";
  }
}
function hi(e) {
  const t = e.DASHBOARD_PREFER_SOURCE;
  return t ? pi.has(t) ? t : (console.warn(
    `[launch-source] Unknown DASHBOARD_PREFER_SOURCE value "${t}"; ignoring override.`
  ), null) : null;
}
const mi = ue(import.meta.url);
function gi(e) {
  return fetch(`http://localhost:${e}/api/health`, {
    signal: AbortSignal.timeout(3e3)
  }).then(async (t) => {
    if (!t.ok) return { running: !1 };
    const n = await t.json();
    if (!n || n.ok !== !0 || typeof n.pid != "number")
      return { running: !1 };
    const r = n.starter, o = `http://localhost:${e}`;
    return { running: !0, starter: r, url: o };
  }).catch(() => ({ running: !1 }));
}
function wi(e) {
  return new Promise((t) => {
    const n = process.platform === "win32" ? "where" : "which";
    He(n, [e], { encoding: "utf-8" }, (r, o) => {
      var i;
      if (r) return t(null);
      const s = (i = o.trim().split(/\r?\n/)[0]) == null ? void 0 : i.trim();
      t(s || null);
    });
  });
}
function yi(e, t) {
  return new Promise((n) => {
    const r = setTimeout(() => {
      o.kill(), n(null);
    }, t), o = He(e, ["--version"], { encoding: "utf-8" }, (s, i) => {
      var d;
      if (clearTimeout(r), s) return n(null);
      const c = ((d = i.trim().split(/\r?\n/)[0]) == null ? void 0 : d.trim()) ?? null;
      n(c || null);
    });
  });
}
function vi(e, t) {
  return mi.resolve(e, t);
}
function bi(e) {
  return {
    healthProbe: (e == null ? void 0 : e.healthProbe) ?? gi,
    existsSync: (e == null ? void 0 : e.existsSync) ?? w,
    readFileSync: (e == null ? void 0 : e.readFileSync) ?? ((t, n) => R(t, n)),
    writeFileSync: (e == null ? void 0 : e.writeFileSync) ?? ((t, n) => he(t, n)),
    renameSync: (e == null ? void 0 : e.renameSync) ?? Ue,
    which: (e == null ? void 0 : e.which) ?? wi,
    spawnVersion: (e == null ? void 0 : e.spawnVersion) ?? yi,
    realpathSync: (e == null ? void 0 : e.realpathSync) ?? xt,
    requireResolve: (e == null ? void 0 : e.requireResolve) ?? vi
  };
}
function tn(e) {
  const t = e.trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return t ? [parseInt(t[1], 10), parseInt(t[2], 10), parseInt(t[3], 10)] : null;
}
function bt(e, t) {
  const n = tn(e), r = tn(t);
  if (!n || !r) return !0;
  for (let o = 0; o < 3; o++) {
    if (n[o] > r[o]) return !0;
    if (n[o] < r[o]) return !1;
  }
  return !0;
}
function Si(e, t) {
  if (e.isPackaged) return null;
  const n = a.join(e.cwd, "packages", "server", "src", "cli.ts"), r = a.join(e.cwd, "packages", "extension", "src", "bridge.ts");
  return t.existsSync(n) && t.existsSync(r) ? { kind: "devMonorepo", cliPath: n, cwd: e.cwd } : null;
}
function ki(e) {
  const t = a.join(D.homedir(), ".pi", "agent", "settings.json");
  try {
    const n = e.readFileSync(t, "utf-8");
    return JSON.parse(n);
  } catch {
    return null;
  }
}
async function xi(e, t) {
  const n = ki(t);
  if (!(n != null && n.extensions)) return null;
  for (const r of n.extensions) {
    if (!r.path) continue;
    const o = a.dirname(r.path), s = a.join(o, "bridge.ts"), i = a.join(o, "src", "bridge.ts");
    if (!t.existsSync(s) && !t.existsSync(i)) continue;
    let c;
    try {
      c = t.requireResolve(
        "@blackbelt-technology/pi-dashboard-server/package.json",
        {
          paths: [
            o,
            a.join(o, ".."),
            a.join(o, "node_modules")
          ]
        }
      );
    } catch {
      continue;
    }
    let d;
    try {
      d = JSON.parse(t.readFileSync(c, "utf-8")).version;
    } catch {
      continue;
    }
    if (!d || !bt(d, e.bundledMinVersion)) continue;
    const l = await t.spawnVersion("pi", 3e3);
    if (!l || !bt(l, e.bundledMinVersion)) continue;
    const f = a.dirname(c);
    return { kind: "piExtension", cliPath: a.join(f, "src", "cli.ts"), cwd: o };
  }
  return null;
}
async function $i(e, t) {
  const n = await t.which("pi-dashboard");
  if (!n) return null;
  let r;
  try {
    r = t.realpathSync(n);
  } catch {
    return null;
  }
  const o = e.resourcesPath.replace(/\\/g, "/");
  if (r.replace(/\\/g, "/").startsWith(o)) return null;
  const i = await t.spawnVersion(n, 3e3);
  if (!i || !bt(i, e.bundledMinVersion)) return null;
  let c;
  try {
    c = t.requireResolve(
      "@blackbelt-technology/pi-dashboard-server/package.json",
      { paths: [a.dirname(n)] }
    );
  } catch {
    return null;
  }
  return { kind: "npmGlobal", cliPath: a.join(a.dirname(c), "src", "cli.ts"), cwd: a.dirname(n) };
}
function Ei(e, t) {
  const n = (t == null ? void 0 : t.existsSync) ?? w, r = (t == null ? void 0 : t.resolveJiti) ?? ((o) => new G().resolveJiti({ anchor: o, anchorOnly: !0 }));
  try {
    if (!n(e)) return !1;
    const o = r(e);
    return typeof o == "string" && o.length > 0;
  } catch {
    return !1;
  }
}
async function Kn(e, t) {
  const n = a.join(D.homedir(), ".pi-dashboard"), r = a.join(
    n,
    "node_modules",
    "@blackbelt-technology",
    "pi-dashboard-server",
    "src",
    "cli.ts"
  ), o = e.bundledMinVersion, s = {
    existsSync: t.existsSync,
    readFileSync: t.readFileSync,
    writeFileSync: t.writeFileSync,
    renameSync: t.renameSync,
    mkdirSync: (l, f) => {
    },
    readdirSync: () => [],
    rmSync: () => {
    },
    statSync: () => ({ isDirectory: () => !1 })
  }, i = ui(n, o, s), c = i ? !1 : Ei(r, {
    existsSync: t.existsSync,
    resolveJiti: (l) => new G().resolveJiti({ anchor: l, anchorOnly: !0 })
  });
  !i && !c && console.warn(
    "[launch-source] extracted source unhealthy (jiti missing); forcing re-extract"
  );
  const d = i || !c;
  if (d) {
    const l = e.dashboardConfigDir ?? a.join(D.homedir(), ".pi", "dashboard"), f = a.join(
      l,
      "migrate",
      (/* @__PURE__ */ new Date()).toISOString().replace(/:/g, "-")
    );
    try {
      const u = a.join(e.resourcesPath, "server");
      fi(n, u, o, f, s);
      const p = a.join(l, "installable.json");
      if (!t.existsSync(p)) {
        const m = a.join(e.resourcesPath, "installable-defaults.json");
        if (t.existsSync(m)) {
          const b = t.readFileSync(m, "utf-8"), S = p + ".tmp";
          t.writeFileSync(S, b), t.renameSync(S, p);
        }
      }
      try {
        const m = await import("node:fs"), b = a.join(n, "package.json"), S = a.join(n, "package-lock.json");
        if (m.existsSync(b))
          try {
            const P = JSON.parse(m.readFileSync(b, "utf-8"));
            P.workspaces !== void 0 && (delete P.workspaces, m.writeFileSync(b, JSON.stringify(P, null, 2) + `
`));
          } catch {
          }
        m.existsSync(S) && m.rmSync(S, { force: !0 });
      } catch (m) {
        console.error(
          "[launch-source] could not normalize managedDir before install:",
          (m == null ? void 0 : m.message) ?? String(m)
        );
      }
      const y = await import("node:fs"), g = a.join(n, "node_modules"), v = a.join(n, ".bundle-node-modules");
      let h = !1;
      try {
        y.existsSync(g) && (y.rmSync(v, { recursive: !0, force: !0 }), y.renameSync(g, v), h = !0);
      } catch (m) {
        console.error(
          "[launch-source] could not stash bundle node_modules:",
          (m == null ? void 0 : m.message) ?? String(m)
        );
      }
      try {
        await Qe();
      } catch (m) {
        console.error(
          "[launch-source] runtime baseline install failed:",
          (m == null ? void 0 : m.message) ?? String(m)
        );
      }
      if (h)
        try {
          y.cpSync(v, g, { recursive: !0 }), y.rmSync(v, { recursive: !0, force: !0 });
        } catch (m) {
          console.error(
            "[launch-source] could not merge bundle node_modules back:",
            (m == null ? void 0 : m.message) ?? String(m)
          );
        }
    } catch (u) {
      return console.error(
        "[launch-source] bundle extraction failed:",
        "code=" + ((u == null ? void 0 : u.code) ?? "unknown"),
        "syscall=" + ((u == null ? void 0 : u.syscall) ?? "unknown"),
        "path=" + ((u == null ? void 0 : u.path) ?? "unknown"),
        "message=" + ((u == null ? void 0 : u.message) ?? String(u))
      ), { kind: "extracted", cliPath: r, cwd: n, didExtract: !1 };
    }
  }
  return { kind: "extracted", cliPath: r, cwd: n, didExtract: d };
}
async function ji(e) {
  const t = bi(e.probes), n = e.port ?? 8e3, r = await t.healthProbe(n);
  if (r.running && r.url)
    return {
      kind: "attach",
      url: r.url,
      starter: r.starter ?? "Standalone"
    };
  if (e.preferOverride) {
    const s = await nn(e.preferOverride, e, t);
    if (!s) throw new qn(e.preferOverride);
    return s;
  }
  const o = ["devMonorepo", "piExtension", "npmGlobal", "extracted"];
  for (const s of o) {
    const i = await nn(s, e, t);
    if (i) return i;
  }
  return Kn(e, t);
}
async function nn(e, t, n) {
  switch (e) {
    case "attach":
      return null;
    // handled separately
    case "devMonorepo":
      return Si(t, n);
    case "piExtension":
      return xi(t, n);
    case "npmGlobal":
      return $i(t, n);
    case "extracted":
      return Kn(t, n);
  }
}
async function Di(e, t, n) {
  const r = (n == null ? void 0 : n.logFile) ?? et(), o = K(), s = o ? a.dirname(a.dirname(o)) : null;
  let i;
  if (o)
    try {
      i = Et(o, ["--version"], { encoding: "utf8", timeout: 5e3 }).trim();
    } catch {
      i = void 0;
    }
  const c = Mt({
    bundledNodeDir: s,
    systemNode: ne(),
    processExecPath: process.execPath,
    platform: process.platform,
    bundledNodeVersion: i
  }), d = new G({ processExecPath: c.nodeBin }).buildSpawnEnv(process.env), l = {};
  for (const [f, u] of Object.entries(d))
    typeof u == "string" && (l[f] = u);
  l.DASHBOARD_STARTER = "Electron", c.kind === "execpath-fallback" && (l.ELECTRON_RUN_AS_NODE = "1", console.warn(
    `[pick-node] No bundled or system Node found — falling back to process.execPath with ELECTRON_RUN_AS_NODE=1. Server launch may behave unexpectedly. execPath=${c.nodeBin}`
  ));
  try {
    const f = await Ln({
      cliPath: e.cliPath,
      anchor: e.cliPath,
      nodeBin: c.nodeBin,
      extraArgs: [
        "--port",
        String(t.port),
        "--pi-port",
        String(t.piPort)
      ],
      env: l,
      starter: "Electron",
      stdio: { logFile: r },
      healthTimeoutMs: 15e3,
      port: t.port,
      detach: !1,
      cwd: e.cwd,
      onExitAfterReady: n == null ? void 0 : n.onExitAfterReady
    });
    return { pid: f.reportedPid ?? f.childPid };
  } catch (f) {
    const u = f instanceof Error ? f.message : String(f);
    throw new Error(`Failed to spawn server from source "${e.kind}": ${u}`);
  }
}
function Pi(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of Re) {
    const r = a.join(
      e,
      "node_modules",
      ...n.split("/"),
      "package.json"
    );
    if (!w(r)) {
      t.set(n, null);
      continue;
    }
    try {
      const o = R(r, "utf8"), s = JSON.parse(o);
      t.set(n, typeof s.version == "string" ? s.version : null);
    } catch {
      t.set(n, null);
    }
  }
  return t;
}
function Ai(e) {
  const t = /* @__PURE__ */ new Map(), n = [];
  e.resourcesPath && n.push(a.join(e.resourcesPath, "offline-packages", "manifest.json")), e.buildTimePinsPath && n.push(e.buildTimePinsPath);
  for (const r of n)
    if (w(r))
      try {
        const o = R(r, "utf8"), s = JSON.parse(o);
        for (const i of s.packages ?? [])
          i.name && i.version && t.set(i.name, i.version);
        if (t.size > 0) return t;
      } catch {
      }
  return t;
}
function Ri(e, t, n) {
  const r = [], o = [], s = [], i = [], c = [];
  for (const [d, l] of e) {
    const f = t.get(d) ?? "";
    let u;
    switch (l === null ? u = n != null && n.has(d) ? "corrupt" : "missing" : f ? l === f ? u = "current" : u = "stale" : u = "current", r.push({ pkg: d, installed: l, expected: f, status: u }), u) {
      case "current":
        o.push(d);
        break;
      case "missing":
        s.push(d);
        break;
      case "stale":
        i.push(d);
        break;
      case "corrupt":
        c.push(d);
        break;
    }
  }
  return {
    diffs: r,
    needsAction: s.length > 0 || i.length > 0 || c.length > 0,
    upToDate: o,
    missing: s,
    stale: i,
    corrupt: c
  };
}
function Ni(e) {
  const t = /* @__PURE__ */ new Set();
  for (const n of Re) {
    const r = a.join(
      e,
      "node_modules",
      ...n.split("/"),
      "package.json"
    );
    w(r) && t.add(n);
  }
  return t;
}
function St(e) {
  const t = process.hrtime.bigint(), n = Pi(e.managedDir), r = process.hrtime.bigint(), o = Ai(e), s = process.hrtime.bigint(), i = Ni(e.managedDir), c = /* @__PURE__ */ new Set();
  for (const [u, p] of n)
    p === null && i.has(u) && c.add(u);
  const d = Ri(n, o, c), l = process.hrtime.bigint(), f = (u, p) => (Number(p - u) / 1e6).toFixed(1);
  return console.log(
    `[preflight] runPreflight done totalMs=${f(t, l)} inventoryMs=${f(t, r)} pinsMs=${f(r, s)} classifyMs=${f(s, l)} entries=${n.size} needsAction=${d.needsAction}`
  ), d;
}
function Yn(e) {
  if (!e.needsAction) return null;
  const t = [];
  if (e.corrupt.length > 0 && t.push(
    `Corrupt: ${e.corrupt.join(", ")}. ~/.pi-dashboard/node_modules entries unreadable. Reinstall will repair.`
  ), e.missing.length > 0 && t.push(
    `Missing: ${e.missing.join(", ")}. Reinstall will fetch from the bundled offline cache.`
  ), e.stale.length > 0) {
    const n = e.diffs.filter((r) => r.status === "stale").map((r) => `${r.pkg} (have ${r.installed}, want ${r.expected})`).join(", ");
    t.push(`Outdated: ${n}. Reinstall will update.`);
  }
  return t.join(" ");
}
function Ti(e, t) {
  if (!e || !t) return "unknown";
  const n = rn(e), r = rn(t);
  return !n || !r ? "unknown" : n.major !== r.major ? n.major > r.major ? "running-newer" : "running-older" : n.minor !== r.minor ? n.minor > r.minor ? "running-newer" : "running-older" : n.patch !== r.patch ? n.patch > r.patch ? "running-newer" : "running-older" : n.pre === r.pre ? "match" : !n.pre && r.pre ? "running-newer" : n.pre && !r.pre ? "running-older" : n.pre > r.pre ? "running-newer" : n.pre < r.pre ? "running-older" : "match";
}
function rn(e) {
  const n = e.trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)(?:[-+](.+))?$/);
  return n ? {
    major: Number(n[1]),
    minor: Number(n[2]),
    patch: Number(n[3]),
    pre: n[4] ?? null
  } : null;
}
function _i(e) {
  return {
    diffs: e.diffs.map((t) => ({
      pkg: t.pkg,
      installed: t.installed,
      expected: t.expected,
      status: t.status
    })),
    missing: e.missing,
    stale: e.stale,
    corrupt: e.corrupt,
    upToDate: e.upToDate,
    needsAction: e.needsAction,
    diagnosis: Yn(e)
  };
}
function on(e) {
  for (const t of W.getAllWindows())
    if (!t.isDestroyed())
      try {
        t.webContents.send("dashboard:install-progress", e);
      } catch {
      }
}
function Y(e, t) {
  for (const n of W.getAllWindows())
    if (!n.isDestroyed())
      try {
        n.webContents.send("dashboard:launch-status", { phase: e, message: t });
      } catch {
      }
}
function Oi() {
  const e = K();
  return e ? process.platform === "win32" ? a.dirname(e) : a.dirname(a.dirname(e)) : null;
}
let $e = null, Ee = null;
function Mi(e) {
  const t = e.managedDir ?? E, n = e.resourcesPath ?? process.resourcesPath ?? void 0;
  $.removeHandler("dashboard:check-inventory"), $.handle("dashboard:check-inventory", async () => {
    try {
      const r = St({ managedDir: t, resourcesPath: n });
      return _i(r);
    } catch (r) {
      return console.error("[recovery-ipc] inventory read failed:", (r == null ? void 0 : r.message) ?? r), {
        diffs: [],
        missing: [],
        stale: [],
        corrupt: [],
        upToDate: [],
        needsAction: !1,
        diagnosis: `Inventory read failed: ${(r == null ? void 0 : r.message) ?? r}`
      };
    }
  }), $.removeHandler("dashboard:reinstall-managed"), $.handle("dashboard:reinstall-managed", async () => $e || ($e = (async () => {
    try {
      Y("reinstalling", "Reinstalling managed packages…");
      const r = St({ managedDir: t, resourcesPath: n }), o = r.diffs.filter((s) => s.status !== "current").map((s) => s.pkg);
      return await e.installStandalone((s) => {
        on(s);
      }, r.upToDate), Y("ready", "Reinstall complete"), { kind: "ok", attempted: o };
    } catch (r) {
      const o = r instanceof Error ? r.message : String(r);
      return console.error("[recovery-ipc] reinstall failed:", o), Y("failed", `Reinstall failed: ${o}`), { kind: "failed", reason: o };
    } finally {
      $e = null;
    }
  })(), $e)), $.removeHandler("dashboard:force-reinstall"), $.handle("dashboard:force-reinstall", async () => {
    if (Ee) return Ee;
    const r = Ct(t), o = r.wipe.length, s = r.preserve.length, { response: i } = await H.showMessageBox({
      type: "warning",
      title: "PI Dashboard",
      message: "Force reinstall managed packages?",
      detail: `This will wipe ${o} Electron-owned path(s) under ~/.pi-dashboard/ and reinstall from the bundled offline cache.

${s} user-installed path(s) will be preserved. Settings, sessions, and credentials (under ~/.pi/) are unaffected.`,
      buttons: ["Cancel", "Reinstall"],
      defaultId: 0,
      cancelId: 0
    });
    return i !== 1 ? { kind: "cancelled" } : (Ee = (async () => {
      var c, d, l, f;
      try {
        Y("force-reinstalling", "Force reinstalling managed packages…");
        const u = Oi(), p = await Is({
          managedDir: t,
          bundledNodeDir: u,
          installStandalone: e.installStandalone,
          onProgress: (y) => {
            on({ step: "force-reinstall", status: "running", output: y }), Y("wiping", y);
          }
        });
        return p.ok ? (Y("ready", "Force reinstall complete"), writeAuditEntry({
          operation: "doctor.force-reinstall",
          packages: r.wipe,
          outcome: "ok",
          details: { wiped: ((l = p.wiped) == null ? void 0 : l.length) ?? 0, preserved: ((f = p.preserved) == null ? void 0 : f.length) ?? 0 }
        }), { kind: "ok", wiped: p.wiped, preserved: p.preserved }) : (Y("failed", p.error ?? "Force reinstall failed"), writeAuditEntry({
          operation: "doctor.force-reinstall",
          packages: r.wipe,
          outcome: "failed",
          error: p.error,
          details: { wiped: ((c = p.wiped) == null ? void 0 : c.length) ?? 0, preserved: ((d = p.preserved) == null ? void 0 : d.length) ?? 0 }
        }), {
          kind: "failed",
          reason: p.error,
          wiped: p.wiped,
          preserved: p.preserved
        });
      } catch (u) {
        const p = u instanceof Error ? u.message : String(u);
        return console.error("[recovery-ipc] force reinstall failed:", p), Y("failed", `Force reinstall failed: ${p}`), writeAuditEntry({
          operation: "doctor.force-reinstall",
          packages: r.wipe,
          outcome: "failed",
          error: p
        }), { kind: "failed", reason: p };
      } finally {
        Ee = null;
      }
    })(), Ee);
  });
}
const Xn = pe(import.meta.url);
process.platform === "linux" && !process.env.ELECTRON_OZONE_PLATFORM_HINT && j.commandLine.appendSwitch("ozone-platform-hint", "auto");
const Zn = process.env.TEMP || process.env.TMP || D.tmpdir(), Ii = a.join(Zn, "pi-dashboard-electron.log");
function k(e) {
  const t = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${e}
`;
  try {
    V(Zn, { recursive: !0 }), an(Ii, t);
  } catch {
  }
}
k("=== Electron starting ===");
k(`platform=${process.platform} arch=${process.arch} pid=${process.pid}`);
k(`resourcesPath=${process.resourcesPath || "(none)"}`);
k(`execPath=${process.execPath}`);
const Qn = kr(), er = process.env.ELECTRON_DISABLE_GPU || Qn;
k(`VM detection: isVM=${Qn} disableGpu=${!!er}`);
er && (j.disableHardwareAcceleration(), j.commandLine.appendSwitch("disable-gpu"), j.commandLine.appendSwitch("disable-software-rasterizer"), k("GPU disabled"));
k("Importing lib modules...");
k("All imports loaded");
let x = null, L = null, Le = !0;
function Ci() {
  L = new W({
    width: 320,
    height: 320,
    frame: !1,
    transparent: !0,
    resizable: !1,
    alwaysOnTop: !0,
    skipTaskbar: !0,
    center: !0,
    webPreferences: { nodeIntegration: !1, contextIsolation: !0 }
  }), L.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<html><head><style>
    html, body { overflow: hidden; }
    body { margin:0; display:flex; align-items:center; justify-content:center;
           height:100vh; background:transparent; -webkit-app-region:drag; }
    .card { background:#0d1117; border-radius:20px; padding:32px 36px;
            box-shadow:0 8px 32px rgba(0,0,0,0.5); text-align:center;
            min-width: 200px; max-width: 240px; box-sizing: border-box; }
    .pi { font-size:80px; color:#4a90d9; margin-bottom:8px; font-weight:bold;
          font-family:-apple-system,BlinkMacSystemFont,sans-serif; }
    .label { font-size:14px; color:#c9d1d9; margin-bottom:16px;
             font-family:-apple-system,BlinkMacSystemFont,sans-serif; }
    .spinner { margin: 12px auto; border: 2px solid #30363d;
               border-top-color: #4a90d9; border-radius: 50%;
               width: 18px; height: 18px; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status { font-size:12px; color:#8b949e; height:16px;
              font-family:-apple-system,BlinkMacSystemFont,sans-serif;
              transition: opacity 0.2s; }
  </style></head><body><div class="card">
    <div class="pi">π</div>
    <div class="label">pi-agent-dashboard</div>
    <div class="spinner"></div>
    <div class="status" id="status">Starting…</div>
  </div></body></html>`)}`), L.on("closed", () => {
    L = null;
  });
}
function z(e) {
  if (k(`splash: ${e}`), !L || L.isDestroyed()) return;
  const t = e.replace(/`/g, "\\`").replace(/\$/g, "\\$");
  L.webContents.executeJavaScript(
    `(() => { const el = document.getElementById("status"); if (el) el.textContent = \`${t}\`; })()`
  ).catch(() => {
  });
}
function ee() {
  L && !L.isDestroyed() && L.close(), L = null;
}
function Li() {
  const e = a.dirname(Xn), t = a.join(e, "preload.js");
  if (T.existsSync(t)) return t;
  const n = a.join(process.cwd(), ".vite", "build", "preload.js");
  return T.existsSync(n) ? n : t;
}
function Bi() {
  $.removeHandler("dashboard:request-launch"), $.handle("dashboard:request-launch", async (e, t = {}) => Ie({ force: !!(t != null && t.force) })), $.removeHandler("dashboard:read-server-log"), $.handle("dashboard:read-server-log", async (e, t = {}) => Hn((t == null ? void 0 : t.lines) ?? 20)), $.removeAllListeners("dashboard:open-doctor"), $.on("dashboard:open-doctor", () => {
    Je();
  }), $.removeAllListeners("wizard:open-doctor"), $.on("wizard:open-doctor", () => {
    Je();
  });
}
function Fi() {
  return bs((e) => {
    if (!(!x || x.isDestroyed()))
      try {
        x.webContents.send("dashboard:launch-status", e);
      } catch {
      }
  });
}
function zi() {
  const e = a.dirname(Xn), t = a.resolve(e, "..", "..", "resources", "loading.html");
  if (T.existsSync(t)) return t;
  if (process.resourcesPath) {
    const n = a.join(process.resourcesPath, "loading.html");
    if (T.existsSync(n)) return n;
  }
  return t;
}
async function sn(e) {
  var o;
  let t;
  try {
    t = St({
      managedDir: e.managedDir,
      resourcesPath: e.resourcesPath
    });
  } catch (s) {
    return k(`[preflight] inventory read failed: ${(s == null ? void 0 : s.message) ?? s} — skipping`), "skipped";
  }
  if (!t.needsAction) return "skipped";
  if (t.missing.length === [...t.diffs].length && t.upToDate.length === 0)
    return k("[preflight] all packages missing — deferring to first-run wizard"), "skipped";
  const n = Yn(t) ?? "Managed packages need attention.";
  if (k(`[preflight] needs action: ${n}`), e.silent)
    k("[preflight] silent mode — reinstalling automatically");
  else {
    const { response: s } = await H.showMessageBox({
      type: "question",
      title: "PI Dashboard",
      message: "Managed packages need attention",
      detail: `${n}

Reinstall now from the bundled offline cache?`,
      buttons: ["Reinstall", "Skip"],
      defaultId: 0,
      cancelId: 1
    });
    if (s !== 0)
      return k("[preflight] user declined reinstall"), "skipped";
  }
  (o = e.onStatus) == null || o.call(e, "Reinstalling managed packages…");
  const r = t.diffs.filter((s) => s.status !== "current").map((s) => s.pkg);
  try {
    return await Qe(
      (s) => {
        var i, c;
        s.output ? (i = e.onStatus) == null || i.call(e, `Reinstalling ${s.step}… ${s.output}`) : s.status === "running" && ((c = e.onStatus) == null || c.call(e, `Reinstalling ${s.step}…`));
      },
      t.upToDate
      // skip the up-to-date entries
    ), k("[preflight] reinstall complete"), Ve({
      operation: "preflight.reinstall",
      packages: r,
      skipped: t.upToDate,
      outcome: "ok"
    }), "installed";
  } catch (s) {
    const i = s instanceof Error ? s.message : String(s);
    return console.error(`[preflight] reinstall failed: ${i}`), k(`[preflight] reinstall failed: ${i}`), Ve({
      operation: "preflight.reinstall",
      packages: r,
      skipped: t.upToDate,
      outcome: "failed",
      error: i
    }), "failed";
  }
}
function Me(e, t) {
  const n = X(), r = Buffer.from(JSON.stringify(n.knownServers)).toString("base64"), o = zi(), s = { serverUrl: t };
  n.knownServers.length > 0 && (s.knownServers = r), e.loadFile(o, { query: s }).catch((i) => {
    k(`loadFile(loading.html) failed: ${(i == null ? void 0 : i.message) || i} — falling back to inline data: URL`), e.loadURL(Ui(t, n.knownServers));
  });
}
function Ui(e, t) {
  const n = t.length > 0 ? `<div class="known-servers" id="known-servers" style="display:none; margin-top:20px; text-align:left;">
        <h3 style="color:#c9d1d9; font-size:14px; margin:0 0 8px;">Known Servers</h3>
        ${t.map(
    (o) => `<button onclick="window.switchServer('${o.host}', ${o.port})" class="server-btn">
            <span class="server-label">${o.label || o.host}</span>
            <span class="server-addr">${o.host}:${o.port}</span>
          </button>`
  ).join("")}
      </div>` : "", r = `
    <html>
    <head><style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif;
             display: flex; align-items: center; justify-content: center;
             height: 100vh; margin: 0; background: #0d1117; color: #c9d1d9; }
      .container { text-align: center; max-width: 480px; padding: 0 24px; }
      .pi { font-size: 72px; color: #4a90d9; margin-bottom: 16px; }
      .status { font-size: 14px; color: #8b949e; }
      .error { display: none; margin-top: 24px; text-align: left; }
      .error h3 { color: #f85149; margin: 0 0 12px; font-size: 16px; }
      .error p { margin: 0 0 8px; font-size: 13px; line-height: 1.5; color: #8b949e; }
      .error code { background: #161b22; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
      .server-btn { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 8px 12px;
        margin-bottom: 6px; background: #161b22; border: 1px solid #30363d; border-radius: 6px;
        color: #c9d1d9; cursor: pointer; font-size: 13px; text-align: left; }
      .server-btn:hover { border-color: #4a90d9; background: #1c2128; }
      .server-label { font-weight: 500; }
      .server-addr { color: #8b949e; font-size: 12px; }
      .dot { animation: blink 1.4s infinite; }
      .dot:nth-child(2) { animation-delay: 0.2s; }
      .dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes blink { 0%,20% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } }
    </style></head>
    <body><div class="container">
      <div class="pi">π</div>
      <div class="status" id="status">Connecting to dashboard<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div>
      <div class="error" id="error">
        <h3>Cannot connect to dashboard server</h3>
        <p>The server at <code>${e}</code> is not responding.</p>
        <p>Make sure the dashboard is installed and running:</p>
        <p><code>npm install -g @blackbelt-technology/pi-dashboard</code></p>
        <p><code>pi-dashboard start</code></p>
        <p style="margin-top: 16px; color: #c9d1d9;">The app will connect automatically once the server is available.</p>
        ${n}
      </div>
    </div>
    <script>
      window.switchServer = function(host, port) {
        window.location.href = 'http://' + host + ':' + port;
      };
    <\/script>
    </body>
    </html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(r)}`;
}
let tr = !1, Be = null, Fe = null;
function dt(e) {
  const t = Jn();
  return x = new W({
    title: "PI Dashboard",
    x: t.x,
    y: t.y,
    width: t.width,
    height: t.height,
    webPreferences: {
      nodeIntegration: !1,
      contextIsolation: !0,
      // Preload exposes `window.piDashboard` for the loading page (Start
      // server, Open Doctor, Server log). Once the dashboard URL loads,
      // the namespace is unused but harmless. See change:
      // electron-server-launch-controls.
      preload: Li()
    }
  }), t.isMaximized && x.maximize(), x.webContents.setWindowOpenHandler((n) => (Ae.openExternal(n.url), { action: "deny" })), x.webContents.on("will-navigate", (n, r) => {
    const o = (x == null ? void 0 : x.webContents.getURL()) ?? "", s = wr(e, o, r);
    s === "open-external" ? (n.preventDefault(), Ae.openExternal(r)) : s === "cancel" && n.preventDefault();
  }), x.loadURL(e), x.on("resize", () => x && Qt(x)), x.on("move", () => x && Qt(x)), x.on("close", (n) => {
    !tr && process.platform === "darwin" && (n.preventDefault(), x == null || x.hide());
  }), x.on("closed", () => {
    x = null;
  }), x;
}
function ft() {
  Be = ti(ni), Fe = oi({
    onUpdateAvailable: (e) => {
      H.showMessageBox({
        type: "info",
        title: "Update Available",
        message: `PI Dashboard v${e} is available.`,
        buttons: ["Download & Restart", "Later"],
        defaultId: 0
      }).then(({ response: t }) => {
        t === 0 && en();
      });
    },
    onUpdateDownloaded: (e) => {
      H.showMessageBox({
        type: "info",
        title: "Update Ready",
        message: `PI Dashboard v${e} has been downloaded. Restart to apply.`,
        buttons: ["Restart Now", "Later"],
        defaultId: 0
      }).then(({ response: t }) => {
        t === 0 && en();
      });
    },
    onError: () => {
    }
  });
}
async function ze() {
  tr = !0, zn(!0), Be == null || Be(), Fe == null || Fe(), await Ss(), Gs(), j.quit();
}
async function Hi() {
  if (!j.requestSingleInstanceLock()) {
    j.quit();
    return;
  }
  j.on("before-quit", () => {
    zn(!0);
  }), j.on("second-instance", () => {
    x && (x.isMinimized() && x.restore(), x.show(), x.focus());
  }), await j.whenReady(), Ci(), j.name = "PI Dashboard", zs(), Xo($r), Bi(), Fi(), Mi({ installStandalone: Qe }), j.on("run-setup-wizard", async () => {
    await Pe();
  });
  const e = X();
  z("Checking dashboard server…");
  const t = await fe(e.port, "localhost", {
    timeoutMs: 8e3,
    retries: 3,
    retryDelayMs: 500
  });
  k(
    `Pre-wizard health check: running=${t.running} portConflict=${t.portConflict ?? !1} pid=${t.pid ?? "n/a"}`
  );
  try {
    const p = ii(E);
    p.removed.length > 0 && k(`[bootstrap] legacy state cleanup removed=${p.removed.join(",")}`);
    for (const y of p.errors)
      k(`[bootstrap] legacy state cleanup error path=${y.path} msg=${y.message}`);
  } catch {
  }
  if (si(process.env))
    try {
      const p = await ji({
        isPackaged: j.isPackaged,
        cwd: process.cwd(),
        preferOverride: hi(process.env),
        bundledMinVersion: j.getVersion(),
        resourcesPath: process.resourcesPath ?? "",
        port: e.port
      });
      k(`[launch-source-v2] resolved kind=${p.kind}`);
      let y;
      if (p.kind !== "attach") {
        if (!(p.kind === "extracted" && p.didExtract === !0)) {
          const _ = process.env.PI_DASHBOARD_SILENT_BOOTSTRAP === "1";
          await sn({
            managedDir: E,
            resourcesPath: process.resourcesPath ?? void 0,
            silent: _,
            onStatus: (ae) => z(ae)
          });
        }
        const M = et(), A = fs({
          isGraceful: us,
          log: k,
          onCrash: (_, ae) => {
            const we = `http://localhost:${e.port}`;
            for (const ye of W.getAllWindows()) {
              try {
                ye.webContents.send("dashboard:launch-status", {
                  phase: "crashed",
                  code: _,
                  signal: ae
                });
              } catch {
              }
              try {
                Me(ye, we);
              } catch (tt) {
                k(
                  `[watchdog] failed to route ${ye.id} to loading page: ${tt instanceof Error ? tt.message : String(tt)}`
                );
              }
            }
          }
        });
        y = (await Di(
          p,
          { port: e.port, piPort: e.piPort },
          { logFile: M, onExitAfterReady: A }
        )).pid, k(`[launch-source-v2] spawned server pid=${y}`), ds(y);
      } else
        try {
          const O = await fetch(`${p.url}/api/health`, {
            signal: AbortSignal.timeout(2e3)
          });
          if (O.ok) {
            const M = await O.json(), A = Ti(M.version, j.getVersion());
            A !== "match" && A !== "unknown" && k(
              `[launch-source-v2] version-skew running=${M.version} app=${j.getVersion()} verdict=${A}`
            );
          }
        } catch {
        }
      const g = p.kind === "extracted" && p.didExtract === !0, v = it(E), h = g || !v, m = p.kind === "attach" ? p.url : `http://localhost:${e.port}`;
      h && (z("Preparing dashboard…"), ee(), k(`[launch-source-v2] opening setup wizard didExtract=${g} managedPopulated=${v}`), await Pe(), k("[launch-source-v2] setup wizard closed"));
      const b = Wt(), S = b ? `${m}${b}` : m;
      z("Opening dashboard…");
      const P = dt(S);
      h || ee(), Me(P, S), ct(() => x, ze, {
        getServerStatus: ot,
        onLaunch: (O) => {
          Ie({ force: O });
        }
      }), ft(), Le = !1;
      return;
    } catch (p) {
      if (p instanceof qn) {
        ee(), await H.showMessageBox({
          type: "error",
          title: "PI Dashboard — Launch Source Unavailable",
          message: p.message,
          detail: "Remove the DASHBOARD_PREFER_SOURCE override or fix the pinned source."
        }), j.quit();
        return;
      }
      throw p;
    }
  z("Detecting pi agent…");
  const n = Xe();
  z("Checking bridge extension…");
  const r = mo(), o = it(E);
  k(`Smart detection: pi=${n.found} bridge=${r.found} managedPopulated=${o}`);
  let s = !1;
  if (o) {
    const p = process.env.PI_DASHBOARD_SILENT_BOOTSTRAP === "1";
    s = await sn({
      managedDir: E,
      resourcesPath: process.resourcesPath ?? void 0,
      silent: p,
      onStatus: (g) => z(g)
    }) === "failed";
  }
  const i = Hs({
    piFound: n.found,
    bridgeFound: r.found,
    managedPopulated: o,
    preflightNeedsAction: s
  });
  if (k(`startupAction=${i.kind}`), i.kind === "wizard" && (z("Opening setup wizard…"), ee(), k("Opening wizard window..."), await Pe(), k("Wizard window closed"), !it(E))) {
    k("Wizard not completed (managed dir still empty), quitting"), j.quit();
    return;
  }
  if (process.env.ELECTRON_DEV) {
    const p = "http://localhost:8000", y = dt(p);
    Me(y, p), ct(() => x, ze, {
      getServerStatus: ot,
      onLaunch: (g) => {
        Ie({ force: g });
      }
    }), ft(), Le = !1;
    return;
  }
  let c;
  const d = `http://localhost:${X().port}`;
  for (; ; )
    try {
      z("Launching dashboard server…"), k("ensureServer..."), c = await Un(), k(`Server found at ${c}`);
      break;
    } catch (p) {
      const y = String((p == null ? void 0 : p.message) ?? p);
      if (console.error("ensureServer failed:", y), k(`ensureServer failed: ${y}`), yr(y)) {
        k("Routing to loading page (deadline/child-exit failure)."), c = d;
        break;
      }
      ee();
      const { response: g } = await H.showMessageBox({
        type: "error",
        title: "PI Dashboard",
        message: "Could not start the dashboard server.",
        detail: `${y}

Would you like to run the setup wizard to fix this?`,
        buttons: ["Run Setup", "Retry", "Quit"],
        defaultId: 0
      });
      if (g === 0)
        await Pe();
      else if (g !== 1) {
        j.quit();
        return;
      }
    }
  const l = Wt(), f = l ? `${c}${l}` : c;
  z("Opening dashboard…");
  const u = dt(f);
  ee(), Me(u, f), ct(() => x, ze, {
    getServerStatus: ot,
    onLaunch: (p) => {
      Ie({ force: p });
    }
  }), ft(), Le = !1;
}
j.on("activate", () => {
  x && (x.show(), x.focus());
});
j.on("window-all-closed", () => {
  process.platform !== "darwin" && x === null && !Le && ze();
});
Hi().catch(async (e) => {
  k(`FATAL: ${(e == null ? void 0 : e.message) || e}`), ee(), console.error("Failed to start:", e);
  try {
    await H.showMessageBox({
      type: "error",
      title: "PI Dashboard",
      message: "Unexpected error during startup",
      detail: String((e == null ? void 0 : e.message) || e)
    });
  } catch {
  }
  j.quit();
});
