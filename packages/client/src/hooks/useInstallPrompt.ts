import { useState, useEffect, useCallback, useRef } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallPromptState {
  /** True when a deferred install prompt is available */
  canInstall: boolean;
  /** True when the app is running in standalone/installed mode */
  isInstalled: boolean;
  /** True on iOS Safari (no beforeinstallprompt support) when not standalone */
  isIOS: boolean;
  /** Trigger the deferred install prompt */
  prompt: () => Promise<void>;
}

function detectStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}

function detectIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && !detectStandalone();
}

export function useInstallPrompt(): InstallPromptState {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const isInstalled = detectStandalone();
  const isIOS = detectIOS();

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const prompt = useCallback(async () => {
    const event = deferredPrompt.current;
    if (!event) return;
    await event.prompt();
    deferredPrompt.current = null;
    setCanInstall(false);
  }, []);

  return { canInstall, isInstalled, isIOS, prompt };
}
