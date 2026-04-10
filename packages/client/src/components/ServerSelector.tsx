import React, { useState, useRef, useEffect } from "react";
import { Icon } from "@mdi/react";
import { mdiServerNetwork, mdiCheck, mdiChevronDown } from "@mdi/js";

export interface DiscoveredServerInfo {
  host: string;
  port: number;
  piPort: number;
  version: string;
  pid: number;
  isLocal: boolean;
  source: "mdns" | "fallback";
}

interface Props {
  servers: DiscoveredServerInfo[];
  currentHost: string;
  currentPort: number;
  connected: boolean;
  onSwitch: (host: string, port: number) => void;
}

export function ServerSelector({ servers, currentHost, currentPort, connected, onSwitch }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [availability, setAvailability] = useState<Map<string, boolean>>(new Map());

  // Probe non-current servers for availability when dropdown opens
  useEffect(() => {
    if (!open || servers.length === 0) return;
    let cancelled = false;
    const currentKey = `${currentHost}:${currentPort}`;
    const others = servers.filter(s => `${s.host}:${s.port}` !== currentKey);
    for (const s of others) {
      const key = `${s.host}:${s.port}`;
      fetch(`http://${s.host}:${s.port}/api/health`, { signal: AbortSignal.timeout(2000) })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (!cancelled) setAvailability(prev => new Map(prev).set(key, d?.ok === true)); })
        .catch(() => { if (!cancelled) setAvailability(prev => new Map(prev).set(key, false)); });
    }
    return () => { cancelled = true; };
  }, [open, servers, currentHost, currentPort]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (servers.length === 0) return null;

  // Ensure localhost is always in the list when current server is remote
  const isCurrentLocal = currentHost === "localhost" || currentHost === "127.0.0.1";
  const effectiveServers = [...servers];
  if (!isCurrentLocal && !effectiveServers.some(s => s.host === "localhost" && s.port === currentPort)) {
    effectiveServers.unshift({
      host: "localhost",
      port: currentPort,
      piPort: 9999,
      version: "",
      pid: 0,
      isLocal: true,
      source: "fallback",
    });
  }

  const currentKey = `${currentHost}:${currentPort}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
        title="Switch server"
      >
        <Icon path={mdiServerNetwork} size={0.55} />
        <span className="truncate max-w-[180px]">
          {currentHost === "localhost" ? "Local" : currentHost}
        </span>
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
        <Icon path={mdiChevronDown} size={0.45} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[220px] bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-lg shadow-xl py-1">
          {effectiveServers.map((server) => {
            const key = `${server.host}:${server.port}`;
            const isCurrent = key === currentKey;
            return (
              <button
                key={key}
                onClick={() => {
                  if (!isCurrent) onSwitch(server.host, server.port);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer ${
                  isCurrent ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{server.host}</div>
                  <div className="text-[var(--text-tertiary)]">
                    :{server.port} · v{server.version}
                  </div>
                </div>
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    server.isLocal
                      ? "bg-blue-500/20 text-blue-400"
                      : "bg-purple-500/20 text-purple-400"
                  }`}
                >
                  {server.isLocal ? "Local" : "Remote"}
                </span>
                {isCurrent ? (
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? "bg-green-500" : "bg-red-500"}`} />
                ) : (
                  availability.has(key) && (
                    <span className={`shrink-0 text-[10px] ${availability.get(key) ? "text-green-500" : "text-red-400"}`}>
                      {availability.get(key) ? "Available" : "Unreachable"}
                    </span>
                  )
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
