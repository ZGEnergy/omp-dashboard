import React, { useState, useEffect, useCallback } from "react";
import { Icon } from "@mdi/react";
import { mdiArrowLeft, mdiContentSave, mdiAlert, mdiPlus, mdiDelete } from "@mdi/js";
import { useLocation } from "wouter";

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  issuerUrl?: string;
  name?: string;
}

interface LlmProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  api: string;
  isNew?: boolean; // true for newly added providers (name is editable)
}

interface AuthConfig {
  secret: string;
  providers: Record<string, ProviderConfig>;
  allowedUsers?: string[];
  bypassUrls?: string[];
  bypassHosts?: string[];
}

interface MemoryLimitsConfig {
  maxEventsPerSession: number;
  maxStringFieldSize: number;
  maxWsBufferBytes: number;
}

interface Config {
  port: number;
  piPort: number;
  autoStart: boolean;
  autoShutdown: boolean;
  shutdownIdleSeconds: number;
  spawnStrategy: string;
  tunnel: { enabled: boolean };
  devBuildOnReload: boolean;
  auth?: AuthConfig;
  memoryLimits: MemoryLimitsConfig;
}

const PROVIDER_LABELS: Record<string, string> = {
  github: "GitHub",
  google: "Google",
  keycloak: "Keycloak",
  oidc: "OIDC (Generic)",
};

const NEEDS_ISSUER = new Set(["keycloak", "oidc"]);

export function SettingsPanel() {
  const [, navigate] = useLocation();
  const [config, setConfig] = useState<Config | null>(null);
  const [original, setOriginal] = useState<Config | null>(null);
  const [llmProviders, setLlmProviders] = useState<LlmProvider[]>([]);
  const [originalLlmProviders, setOriginalLlmProviders] = useState<LlmProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "warn"; text: string } | null>(null);

  useEffect(() => {
    const configPromise = fetch("/api/config").then((res) => res.json());
    const providersPromise = fetch("/api/providers")
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

    Promise.all([configPromise, providersPromise])
      .then(([configData, providersData]) => {
        if (configData.success) {
          setConfig(configData.data);
          setOriginal(JSON.parse(JSON.stringify(configData.data)));
        }
        if (providersData?.success && providersData.providers) {
          const list: LlmProvider[] = Object.entries(providersData.providers).map(
            ([name, entry]: [string, any]) => ({
              name,
              baseUrl: entry.baseUrl || "",
              apiKey: entry.apiKey || "",
              api: entry.api || "openai-completions",
            })
          );
          setLlmProviders(list);
          setOriginalLlmProviders(JSON.parse(JSON.stringify(list)));
        }
      })
      .catch(() => setMessage({ type: "error", text: "Failed to load settings" }))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    if (!config || !original) return;
    setSaving(true);
    setMessage(null);

    // Build partial diff
    const partial: Record<string, any> = {};
    if (config.port !== original.port) partial.port = config.port;
    if (config.piPort !== original.piPort) partial.piPort = config.piPort;
    if (config.autoStart !== original.autoStart) partial.autoStart = config.autoStart;
    if (config.autoShutdown !== original.autoShutdown) partial.autoShutdown = config.autoShutdown;
    if (config.shutdownIdleSeconds !== original.shutdownIdleSeconds) partial.shutdownIdleSeconds = config.shutdownIdleSeconds;
    if (config.spawnStrategy !== original.spawnStrategy) partial.spawnStrategy = config.spawnStrategy;
    if (config.tunnel.enabled !== original.tunnel.enabled) partial.tunnel = { enabled: config.tunnel.enabled };
    if (config.devBuildOnReload !== original.devBuildOnReload) partial.devBuildOnReload = config.devBuildOnReload;

    // Auth diff
    if (JSON.stringify(config.auth) !== JSON.stringify(original.auth)) {
      partial.auth = config.auth || null;
    }

    // Check if LLM providers changed
    const llmChanged = JSON.stringify(llmProviders) !== JSON.stringify(originalLlmProviders);

    if (Object.keys(partial).length === 0 && !llmChanged) {
      setMessage({ type: "warn", text: "No changes to save" });
      setSaving(false);
      return;
    }

    try {
      let restartRequired = false;

      // Save config changes
      if (Object.keys(partial).length > 0) {
        const res = await fetch("/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(partial),
        });
        const data = await res.json();
        if (!data.success) {
          setMessage({ type: "error", text: data.error || "Failed to save config" });
          setSaving(false);
          return;
        }
        restartRequired = data.restartRequired;
        setOriginal(JSON.parse(JSON.stringify(config)));
      }

      // Save LLM providers
      if (llmChanged) {
        const validProviders = llmProviders.filter((p) => p.name.trim() !== "");
        const providersObj: Record<string, any> = {};
        for (const p of validProviders) {
          providersObj[p.name] = {
            baseUrl: p.baseUrl,
            apiKey: p.apiKey,
            api: p.api,
          };
        }
        const res = await fetch("/api/providers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providers: providersObj }),
        });
        const data = await res.json();
        if (!data.success) {
          setMessage({ type: "error", text: data.error || "Failed to save providers" });
          setSaving(false);
          return;
        }
        // Update state: strip isNew flag, update original
        const saved = validProviders.map(({ isNew, ...rest }) => rest);
        setLlmProviders(saved);
        setOriginalLlmProviders(JSON.parse(JSON.stringify(saved)));
      }

      if (restartRequired) {
        setMessage({ type: "warn", text: "Saved. Some changes require a server restart to take effect." });
      } else {
        setMessage({ type: "success", text: "Settings saved" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  }, [config, original, llmProviders, originalLlmProviders]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-tertiary)]">
        Loading settings...
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400">
        Failed to load settings
      </div>
    );
  }

  const update = (fn: (c: Config) => void) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      fn(next);
      return next;
    });
  };

  const ensureAuth = (): AuthConfig => {
    if (!config.auth) {
      const auth: AuthConfig = { secret: "", providers: {}, allowedUsers: [] };
      update((c) => { c.auth = auth; });
      return auth;
    }
    return config.auth;
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-[var(--border-primary)]">
        <button
          onClick={() => navigate("/")}
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          title="Back"
        >
          <Icon path={mdiArrowLeft} size={0.8} />
        </button>
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Settings</h1>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={saving}
          data-testid="save-btn"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
        >
          <Icon path={mdiContentSave} size={0.6} />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`px-4 py-2 text-sm ${
          message.type === "success" ? "bg-green-600/20 text-green-400" :
          message.type === "warn" ? "bg-amber-600/20 text-amber-400" :
          "bg-red-600/20 text-red-400"
        }`}>
          {message.type === "warn" && <Icon path={mdiAlert} size={0.5} className="inline mr-1" />}
          {message.text}
        </div>
      )}

      <div className="p-4 space-y-6 max-w-2xl">
        {/* Server */}
        <Section title="Server">
          <NumberField label="HTTP Port" value={config.port} onChange={(v) => update((c) => { c.port = v; })} />
          <NumberField label="Pi Gateway Port" value={config.piPort} onChange={(v) => update((c) => { c.piPort = v; })} />
          <ToggleField label="Auto Shutdown" value={config.autoShutdown} onChange={(v) => update((c) => { c.autoShutdown = v; })} />
          {config.autoShutdown && (
            <NumberField label="Idle Seconds Before Shutdown" value={config.shutdownIdleSeconds} onChange={(v) => update((c) => { c.shutdownIdleSeconds = v; })} />
          )}
        </Section>

        {/* Sessions */}
        <Section title="Sessions">
          <SelectField
            label="Spawn Strategy"
            value={config.spawnStrategy}
            options={[{ value: "headless", label: "Headless" }, { value: "tmux", label: "Tmux" }]}
            onChange={(v) => update((c) => { c.spawnStrategy = v; })}
          />
        </Section>

        {/* Tunnel */}
        <Section title="Tunnel">
          <ToggleField label="Enable Zrok Tunnel" value={config.tunnel.enabled} onChange={(v) => update((c) => { c.tunnel.enabled = v; })} />
        </Section>

        {/* LLM Providers */}
        <Section title="LLM Providers">
          <p className="text-xs text-[var(--text-tertiary)] mb-3">
            Register custom OpenAI-compatible API endpoints for model access.
          </p>
          {llmProviders.map((provider, index) => (
            <LlmProviderCard
              key={`${provider.name}-${index}`}
              provider={provider}
              onChange={(updated) => {
                setLlmProviders((prev) => prev.map((p, i) => (i === index ? updated : p)));
              }}
              onRemove={() => {
                setLlmProviders((prev) => prev.filter((_, i) => i !== index));
              }}
            />
          ))}
          <button
            onClick={() => setLlmProviders((prev) => [...prev, { name: "", baseUrl: "", apiKey: "", api: "openai-completions", isNew: true }])}
            className="flex items-center gap-1.5 text-sm text-[var(--accent-blue)] hover:text-blue-400 mt-1"
          >
            <Icon path={mdiPlus} size={0.6} />
            Add Provider
          </button>
        </Section>

        {/* Authentication */}
        <Section title="Authentication">
          <p className="text-xs text-[var(--text-tertiary)] mb-3">
            Configure OAuth providers to protect external (tunnel) access. Localhost is always open.
          </p>
          {["github", "google", "keycloak", "oidc"].map((key) => (
            <ProviderSection
              key={key}
              providerKey={key}
              provider={config.auth?.providers[key]}
              onChange={(p) => update((c) => {
                if (!c.auth) c.auth = { secret: "", providers: {}, allowedUsers: [] };
                if (p) {
                  c.auth.providers[key] = p;
                } else {
                  delete c.auth.providers[key];
                }
              })}
            />
          ))}
          <div className="mt-3">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Allowed Users <span className="text-[var(--text-tertiary)]">(one per line: username, email, or *@domain)</span>
            </label>
            <textarea
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-1.5 text-sm text-[var(--text-primary)] font-mono resize-y"
              rows={3}
              placeholder={"octocat\nuser@example.com\n*@company.com"}
              value={(config.auth?.allowedUsers || []).join("\n")}
              onChange={(e) => {
                const users = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
                update((c) => {
                  if (!c.auth) c.auth = { secret: "", providers: {}, allowedUsers: [] };
                  c.auth.allowedUsers = users;
                });
              }}
            />
          </div>
          <div className="mt-3">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Bypass URL Prefixes <span className="text-[var(--text-tertiary)]">(one per line — requests to these paths skip auth)</span>
            </label>
            <textarea
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-1.5 text-sm text-[var(--text-primary)] font-mono resize-y"
              rows={2}
              data-testid="bypass-urls-textarea"
              placeholder={"/webhooks/\n/metrics"}
              value={(config.auth?.bypassUrls || []).join("\n")}
              onChange={(e) => {
                const urls = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
                update((c) => {
                  if (!c.auth) c.auth = { secret: "", providers: {} };
                  c.auth.bypassUrls = urls;
                });
              }}
            />
          </div>
          <div className="mt-3">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Trusted Hosts <span className="text-[var(--text-tertiary)]">(one per line — requests from these IPs/hosts skip auth. Supports exact IP, wildcards like 10.0.0.*, CIDR like 192.168.1.0/24)</span>
            </label>
            <textarea
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-1.5 text-sm text-[var(--text-primary)] font-mono resize-y"
              rows={2}
              data-testid="bypass-hosts-textarea"
              placeholder={"10.0.0.*\n192.168.1.0/24"}
              value={(config.auth?.bypassHosts || []).join("\n")}
              onChange={(e) => {
                const hosts = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
                update((c) => {
                  if (!c.auth) c.auth = { secret: "", providers: {} };
                  c.auth.bypassHosts = hosts;
                });
              }}
            />
          </div>
        </Section>

        {/* Memory Limits */}
        <Section title="Memory Limits">
          <p className="text-xs text-[var(--text-tertiary)] mb-2">
            Controls for bounding server memory usage. Set to 0 to disable a limit.
            Requires server restart.
          </p>
          <NumberField
            label="Max Events Per Session"
            value={config.memoryLimits?.maxEventsPerSession ?? 200}
            onChange={(v) => update((c) => {
              if (!c.memoryLimits) c.memoryLimits = { maxEventsPerSession: 200, maxStringFieldSize: 4000, maxWsBufferBytes: 4194304 };
              c.memoryLimits.maxEventsPerSession = v;
            })}
          />
          <NumberField
            label="Max String Truncation (chars)"
            value={config.memoryLimits?.maxStringFieldSize ?? 4000}
            onChange={(v) => update((c) => {
              if (!c.memoryLimits) c.memoryLimits = { maxEventsPerSession: 200, maxStringFieldSize: 4000, maxWsBufferBytes: 4194304 };
              c.memoryLimits.maxStringFieldSize = v;
            })}
          />
          <NumberField
            label="Max WebSocket Buffer (bytes)"
            value={config.memoryLimits?.maxWsBufferBytes ?? 4194304}
            onChange={(v) => update((c) => {
              if (!c.memoryLimits) c.memoryLimits = { maxEventsPerSession: 200, maxStringFieldSize: 4000, maxWsBufferBytes: 4194304 };
              c.memoryLimits.maxWsBufferBytes = v;
            })}
          />
        </Section>

        {/* Developer */}
        <Section title="Developer">
          <ToggleField label="Dev Build on Reload" value={config.devBuildOnReload} onChange={(v) => update((c) => { c.devBuildOnReload = v; })} />
        </Section>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3 pb-1 border-b border-[var(--border-secondary)]">
        {title}
      </h2>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-[var(--text-secondary)]">{label}</label>
      <input
        type="number"
        className="w-24 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-1 text-sm text-[var(--text-primary)] text-right"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
      />
    </div>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-[var(--text-secondary)]">{label}</label>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors ${value ? "bg-blue-600" : "bg-[var(--bg-tertiary)]"}`}
      >
        <span className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${value ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-[var(--text-secondary)]">{label}</label>
      <select
        className="bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-1 text-sm text-[var(--text-primary)]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ProviderSection({ providerKey, provider, onChange }: {
  providerKey: string;
  provider?: ProviderConfig;
  onChange: (p: ProviderConfig | null) => void;
}) {
  const enabled = !!provider;
  const label = PROVIDER_LABELS[providerKey] || providerKey;
  const needsIssuer = NEEDS_ISSUER.has(providerKey);

  return (
    <div className="border border-[var(--border-secondary)] rounded p-3 mb-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
        <button
          onClick={() => {
            if (enabled) {
              onChange(null);
            } else {
              onChange({ clientId: "", clientSecret: "", ...(needsIssuer ? { issuerUrl: "" } : {}) });
            }
          }}
          className={`text-xs px-2 py-0.5 rounded ${enabled ? "bg-red-600/20 text-red-400 hover:bg-red-600/30" : "bg-green-600/20 text-green-400 hover:bg-green-600/30"}`}
        >
          {enabled ? "Remove" : "Enable"}
        </button>
      </div>
      {enabled && (
        <div className="space-y-2">
          <TextField
            label="Client ID"
            value={provider!.clientId}
            onChange={(v) => onChange({ ...provider!, clientId: v })}
          />
          <TextField
            label="Client Secret"
            value={provider!.clientSecret}
            onChange={(v) => onChange({ ...provider!, clientSecret: v })}
            type="password"
          />
          {needsIssuer && (
            <TextField
              label="Issuer URL"
              value={provider!.issuerUrl || ""}
              onChange={(v) => onChange({ ...provider!, issuerUrl: v })}
              placeholder="https://keycloak.example.com/realms/myrealm"
            />
          )}
        </div>
      )}
    </div>
  );
}

function TextField({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--text-tertiary)] mb-0.5">{label}</label>
      <input
        type={type}
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-1 text-sm text-[var(--text-primary)]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

const API_TYPE_OPTIONS = [
  { value: "openai-completions", label: "OpenAI Completions" },
  { value: "anthropic", label: "Anthropic" },
];

function LlmProviderCard({ provider, onChange, onRemove }: {
  provider: LlmProvider;
  onChange: (p: LlmProvider) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-[var(--border-secondary)] rounded p-3 mb-2">
      <div className="flex items-center justify-between mb-2">
        {provider.isNew ? (
          <input
            type="text"
            className="bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-0.5 text-sm font-medium text-[var(--text-primary)] w-48"
            placeholder="Provider name"
            value={provider.name}
            onChange={(e) => onChange({ ...provider, name: e.target.value })}
            autoFocus
          />
        ) : (
          <span className="text-sm font-medium text-[var(--text-primary)]">{provider.name}</span>
        )}
        <button
          onClick={onRemove}
          className="text-xs px-2 py-0.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 flex items-center gap-1"
        >
          <Icon path={mdiDelete} size={0.45} />
          Remove
        </button>
      </div>
      <div className="space-y-2">
        <TextField
          label="Base URL"
          value={provider.baseUrl}
          onChange={(v) => onChange({ ...provider, baseUrl: v })}
          placeholder="https://api.example.com/v1"
        />
        <TextField
          label="API Key"
          value={provider.apiKey}
          onChange={(v) => onChange({ ...provider, apiKey: v })}
          type="password"
          placeholder="sk-... or $ENV_VAR_NAME"
        />
        <div>
          <label className="block text-xs text-[var(--text-tertiary)] mb-0.5">API Type</label>
          <select
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-1 text-sm text-[var(--text-primary)]"
            value={provider.api}
            onChange={(e) => onChange({ ...provider, api: e.target.value })}
          >
            {API_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
