import React, { useState, useCallback, useEffect } from "react";
import { getApiBase } from "../lib/api-context.js";
import { Icon } from "@mdi/react";
import { mdiTunnel, mdiQrcode } from "@mdi/js";
import { useLocation } from "wouter";
import type { TunnelStatus } from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";
import { QrCodeDialog } from "./QrCodeDialog.js";

const POLL_INTERVAL = 30_000;

/**
 * Unified tunnel/QR button:
 * - unavailable (not set up) → tunnel icon → navigates to setup guide
 * - inactive (set up, not connected) → default QR icon → opens dialog with Connect button
 * - active (connected) → green QR icon → opens dialog with QR code + Disconnect button
 */
export function TunnelButton() {
  const [status, setStatus] = useState<TunnelStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [, navigate] = useLocation();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/tunnel-status`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        return data as TunnelStatus;
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  // Poll tunnel status on mount and every 30s
  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const handleClick = useCallback(async () => {
    const s = await fetchStatus();
    if (!s) return;

    if (s.status === "unavailable") {
      navigate("/tunnel-setup");
    } else {
      // active or inactive → open dialog
      setDialogOpen(true);
    }
  }, [fetchStatus, navigate]);

  const handleDisconnect = useCallback(async () => {
    try {
      await fetch(`${getApiBase()}/api/tunnel-disconnect`, { method: "POST" });
    } catch {
      // ignore
    }
    setDialogOpen(false);
    fetchStatus();
  }, [fetchStatus]);

  const handleConnect = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/tunnel-connect`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          // Refresh status to pick up the new URL, keep dialog open
          await fetchStatus();
          return;
        }
      }
    } catch {
      // ignore
    }
    await fetchStatus();
  }, [fetchStatus]);

  const isActive = status?.status === "active";
  const isUnavailable = !status || status.status === "unavailable";

  const iconPath = isUnavailable ? mdiTunnel : mdiQrcode;

  const color = isActive
    ? "text-green-400"
    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]";

  const title = isActive
    ? `Tunnel: ${status.url} (click for QR code)`
    : status?.status === "inactive"
      ? "Tunnel: disconnected (click to connect)"
      : status?.status === "unavailable"
        ? "Tunnel: zrok not installed (click for setup guide)"
        : "Tunnel status";

  const dialogUrl = status?.status === "active" ? status.url : undefined;

  return (
    <>
      <button
        onClick={handleClick}
        className={color}
        title={title}
        data-testid="tunnel-btn"
      >
        <Icon path={iconPath} size={0.6} />
      </button>
      {dialogOpen && (
        <QrCodeDialog
          url={dialogUrl}
          connected={isActive}
          onClose={() => setDialogOpen(false)}
          onDisconnect={handleDisconnect}
          onConnect={handleConnect}
          onSetup={() => { setDialogOpen(false); navigate("/tunnel-setup"); }}
        />
      )}
    </>
  );
}
