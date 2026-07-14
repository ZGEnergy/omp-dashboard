/**
 * Settings section for Web Push notifications.
 *
 * Reflects the `usePushSubscription` hook: enable/disable this device, send a
 * test notification, and an iOS hint (Web Push on iOS Safari requires the PWA
 * be installed to the home screen first). Renders a "not supported" note when
 * the browser lacks Service Worker / Push support (or push is disabled on the
 * server, in which case the hook stays `unknown`).
 * See change: add-server-push-notifications.
 */
import { useCallback, useState } from "react";
import { usePushSubscription } from "../hooks/usePushSubscription.js";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function PushNotificationsSection() {
  const { supported, status, subscribe, unsubscribe, sendTest } = usePushSubscription();
  const [busy, setBusy] = useState(false);
  const ios = isIOS();
  const showIosHint = ios && !isStandalone();

  const handleToggle = useCallback(async () => {
    // Enable is a no-op while status is still "unknown" (VAPID key not loaded
    // / server push disabled) — keep the button disabled in that state.
    if (status === "unknown") return;
    setBusy(true);
    try {
      if (status === "subscribed") await unsubscribe();
      else await subscribe();
    } finally {
      setBusy(false);
    }
  }, [status, subscribe, unsubscribe]);

  if (!supported) {
    return (
      <div className="space-y-2" data-testid="push-unsupported">
        <div className="text-xs text-[var(--text-muted)]">
          Push notifications are not supported in this browser.
        </div>
        {ios && (
          <div className="text-xs text-[var(--text-muted)]" data-testid="push-ios-hint">
            iOS users: install this app to your home screen (Share → Add to Home Screen), open the
            installed app, then enable notifications. Safari tabs cannot receive Web Push.
          </div>
        )}
      </div>
    );
  }

  const toggleDisabled = busy || status === "unknown";
  const toggleLabel =
    status === "subscribed"
      ? "Disable on this device"
      : status === "unknown"
        ? "Checking push support…"
        : "Enable on this device";

  return (
    <div className="space-y-2" data-testid="push-section">
      <p className="text-xs text-[var(--text-tertiary)]">
        Get a notification when a session finishes a turn, asks for input, or crashes — even when the
        dashboard isn't open.
      </p>

      {status === "denied" ? (
        <div className="text-xs text-amber-400" data-testid="push-denied">
          Notification permission was denied. Re-enable it in your browser settings, then try again.
        </div>
      ) : (
        <button
          type="button"
          onClick={handleToggle}
          disabled={toggleDisabled}
          data-testid="push-toggle"
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {toggleLabel}
        </button>
      )}

      {status === "subscribed" && (
        <button
          type="button"
          onClick={() => sendTest()}
          data-testid="push-test"
          className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          Send test notification
        </button>
      )}

      {showIosHint && (
        <div className="text-xs text-[var(--text-muted)]" data-testid="push-ios-hint">
          iOS users: install this app to your home screen first, then enable notifications.
        </div>
      )}
    </div>
  );
}
