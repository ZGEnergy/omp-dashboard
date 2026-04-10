/**
 * UI Proxy for the dashboard bridge extension.
 *
 * Wraps ctx.ui dialog methods (confirm, select, input, editor) to forward
 * them to the dashboard server. For TUI sessions, races the original method
 * against the dashboard response. For headless sessions, only the dashboard
 * can respond.
 *
 * Fire-and-forget methods (notify) are forwarded alongside the original call.
 */

import type { ExtensionUiResponseMessage } from "@blackbelt-technology/pi-dashboard-shared/protocol.js";

export interface UiProxyOptions {
  /** The original ctx.ui object to wrap */
  ui: {
    confirm(title: string, message: string, opts?: any): Promise<boolean>;
    select(title: string, options: string[], opts?: any): Promise<string | undefined>;
    input(title: string, placeholder?: string, opts?: any): Promise<string | undefined>;
    editor?(title: string, prefill?: string, opts?: any): Promise<string | undefined>;
    notify(message: string, type?: string): void;
  };
  /** Whether TUI is available (race mode vs dashboard-only) */
  hasUI: boolean;
  /** Get current session ID */
  getSessionId: () => string;
  /** Send a message to the dashboard server */
  send: (msg: any) => void;
}

interface PendingRequest {
  method: string;
  params: Record<string, unknown>;
  resolve: (value: any) => void;
}

export function createUiProxy(options: UiProxyOptions) {
  const { ui, hasUI, getSessionId, send } = options;
  const pending = new Map<string, PendingRequest>();

  // Capture original method references BEFORE ctx.ui is patched in-place.
  // Without this, the proxy's call to ui.notify() would recurse into itself
  // because bridge.ts overwrites ctx.ui.notify with the proxy's own method.
  const originalConfirm = ui.confirm.bind(ui);
  const originalSelect = ui.select.bind(ui);
  const originalInput = ui.input.bind(ui);
  const originalEditor = ui.editor?.bind(ui);
  const originalNotify = ui.notify.bind(ui);

  function generateRequestId(): string {
    return crypto.randomUUID();
  }

  function sendRequest(method: string, params: Record<string, unknown>): string {
    const requestId = generateRequestId();
    send({
      type: "extension_ui_request",
      sessionId: getSessionId(),
      requestId,
      method,
      params,
    });
    return requestId;
  }

  function createDashboardPromise<T>(requestId: string, method: string, params: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve) => {
      pending.set(requestId, { method, params, resolve });
    });
  }

  /** Re-send all pending UI requests (e.g. after server reconnect) */
  function resendPending(): void {
    for (const [requestId, entry] of pending) {
      send({
        type: "extension_ui_request",
        sessionId: getSessionId(),
        requestId,
        method: entry.method,
        params: entry.params,
      });
    }
  }

  /** Extract the result for a specific dialog method from the response */
  function extractResult(method: string, response: ExtensionUiResponseMessage): any {
    if (response.cancelled) {
      switch (method) {
        case "confirm":
          return false;
        case "multiselect":
          return [];
        default:
          return undefined;
      }
    }

    const result = response.result as Record<string, unknown> | undefined;
    switch (method) {
      case "confirm":
        return result?.confirmed ?? false;
      case "select":
      case "input":
      case "editor":
        return result?.value;
      case "multiselect":
        return (result?.values as string[]) ?? [];
      default:
        return result;
    }
  }

  // Recursion guard: if ui.confirm/select/etc is actually our own proxy
  // (e.g. ctx.ui was already patched from a previous /reload), skip the
  // TUI race to avoid infinite recursion.
  let inProxy = false;

  /** Send a dismiss message to the server so dashboard can close the stale dialog */
  function sendDismiss(requestId: string): void {
    send({
      type: "extension_ui_dismiss",
      sessionId: getSessionId(),
      requestId,
    });
  }

  /**
   * Race TUI promise against dashboard promise with proper cancellation.
   * When TUI wins: clean up pending Map entry + send dismiss to server.
   * When dashboard wins: abort TUI dialog via AbortController.
   */
  function raceWithCancellation<T>(requestId: string, tuiPromise: Promise<T>, dashPromise: Promise<T>, ac: AbortController): Promise<T> {
    // Wire up cross-cancellation before racing
    tuiPromise.then(() => {
      // TUI won — clean up dashboard side
      pending.delete(requestId);
      sendDismiss(requestId);
    }).catch(() => {});
    dashPromise.then(() => {
      // Dashboard won — abort TUI dialog
      ac.abort();
    }).catch(() => {});
    return Promise.race([tuiPromise, dashPromise]);
  }

  const wrappedUi = {
    confirm: (title: string, message: string, opts?: any): Promise<boolean> => {
      const params = { title, message };
      const requestId = sendRequest("confirm", params);
      const dashPromise = createDashboardPromise<boolean>(requestId, "confirm", params);

      if (hasUI && !inProxy) {
        const ac = new AbortController();
        inProxy = true;
        const originalPromise = originalConfirm(title, message, { ...opts, signal: ac.signal }).finally(() => { inProxy = false; });
        return raceWithCancellation(requestId, originalPromise, dashPromise, ac);
      }
      return dashPromise;
    },

    select: (title: string, selectOptions: string[], opts?: any): Promise<string | undefined> => {
      const params = { title, options: selectOptions };
      const requestId = sendRequest("select", params);
      const dashPromise = createDashboardPromise<string | undefined>(requestId, "select", params);

      if (hasUI && !inProxy) {
        const ac = new AbortController();
        inProxy = true;
        const originalPromise = originalSelect(title, selectOptions, { ...opts, signal: ac.signal }).finally(() => { inProxy = false; });
        return raceWithCancellation(requestId, originalPromise, dashPromise, ac);
      }
      return dashPromise;
    },

    input: (title: string, placeholder?: string, opts?: any): Promise<string | undefined> => {
      const params = { title, placeholder };
      const requestId = sendRequest("input", params);
      const dashPromise = createDashboardPromise<string | undefined>(requestId, "input", params);

      if (hasUI && !inProxy) {
        const ac = new AbortController();
        inProxy = true;
        const originalPromise = originalInput(title, placeholder, { ...opts, signal: ac.signal }).finally(() => { inProxy = false; });
        return raceWithCancellation(requestId, originalPromise, dashPromise, ac);
      }
      return dashPromise;
    },

    editor: (title: string, prefill?: string, opts?: any): Promise<string | undefined> => {
      const params = { title, prefill };
      const requestId = sendRequest("editor", params);
      const dashPromise = createDashboardPromise<string | undefined>(requestId, "editor", params);

      if (hasUI && !inProxy && originalEditor) {
        const ac = new AbortController();
        inProxy = true;
        const originalPromise = originalEditor(title, prefill, { ...opts, signal: ac.signal }).finally(() => { inProxy = false; });
        return raceWithCancellation(requestId, originalPromise, dashPromise, ac);
      }
      return dashPromise;
    },

    multiselect: (title: string, selectOptions: string[]): Promise<string[]> => {
      const params = { title, options: selectOptions };
      const requestId = sendRequest("multiselect", params);
      const dashPromise = createDashboardPromise<string[]>(requestId, "multiselect", params);

      if (hasUI && !inProxy) {
        const ac = new AbortController();
        inProxy = true;
        const numbered = selectOptions.map((o, i) => `${i + 1}. ${o}`).join("\n");
        const tuiPromise = originalInput(`${title}\n${numbered}`, "e.g. 1,3", { signal: ac.signal }).then((raw) => {
          if (!raw) return [] as string[];
          return raw
            .split(",")
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !isNaN(n) && n >= 1 && n <= selectOptions.length)
            .map((n) => selectOptions[n - 1]);
        }).finally(() => { inProxy = false; });
        return raceWithCancellation(requestId, tuiPromise, dashPromise, ac);
      }
      return dashPromise;
    },

    notify: (message: string, type?: string): void => {
      originalNotify(message, type);
      sendRequest("notify", { message, level: type });
    },
  };

  function handleResponse(response: ExtensionUiResponseMessage): void {
    const entry = pending.get(response.requestId);
    if (!entry) return;

    pending.delete(response.requestId);
    entry.resolve(extractResult(entry.method, response));
  }

  /**
   * Cancel all pending UI requests. Resolves each pending promise with a
   * "cancelled" result so the TUI dialogs are dismissed.
   *
   * Used when an external channel (e.g. architect_prompt_response) answers a
   * question that was also forwarded through the ui-proxy. Without this, the
   * TUI dialog would stay open forever because the proxy’s dashPromise never
   * resolves.
   */
  function cancelAllPending(): void {
    for (const [requestId, entry] of pending) {
      const cancelled: ExtensionUiResponseMessage = {
        type: "extension_ui_response",
        sessionId: getSessionId(),
        requestId,
        cancelled: true,
      };
      entry.resolve(extractResult(entry.method, cancelled));
      sendDismiss(requestId);
    }
    pending.clear();
  }

  return { wrappedUi, handleResponse, resendPending, cancelAllPending };
}
