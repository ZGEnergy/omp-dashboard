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

import type { ExtensionUiResponseMessage } from "../shared/protocol.js";

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
      default:
        return result;
    }
  }

  const wrappedUi = {
    confirm: (title: string, message: string, opts?: any): Promise<boolean> => {
      const params = { title, message };
      const requestId = sendRequest("confirm", params);
      const dashPromise = createDashboardPromise<boolean>(requestId, "confirm", params);

      if (hasUI) {
        const originalPromise = ui.confirm(title, message, opts);
        return Promise.race([originalPromise, dashPromise]);
      }
      return dashPromise;
    },

    select: (title: string, selectOptions: string[], opts?: any): Promise<string | undefined> => {
      const params = { title, options: selectOptions };
      const requestId = sendRequest("select", params);
      const dashPromise = createDashboardPromise<string | undefined>(requestId, "select", params);

      if (hasUI) {
        const originalPromise = ui.select(title, selectOptions, opts);
        return Promise.race([originalPromise, dashPromise]);
      }
      return dashPromise;
    },

    input: (title: string, placeholder?: string, opts?: any): Promise<string | undefined> => {
      const params = { title, placeholder };
      const requestId = sendRequest("input", params);
      const dashPromise = createDashboardPromise<string | undefined>(requestId, "input", params);

      if (hasUI) {
        const originalPromise = ui.input(title, placeholder, opts);
        return Promise.race([originalPromise, dashPromise]);
      }
      return dashPromise;
    },

    editor: (title: string, prefill?: string, opts?: any): Promise<string | undefined> => {
      const params = { title, prefill };
      const requestId = sendRequest("editor", params);
      const dashPromise = createDashboardPromise<string | undefined>(requestId, "editor", params);

      if (hasUI && ui.editor) {
        const originalPromise = ui.editor(title, prefill, opts);
        return Promise.race([originalPromise, dashPromise]);
      }
      return dashPromise;
    },

    notify: (message: string, type?: string): void => {
      ui.notify(message, type);
      sendRequest("notify", { message, level: type });
    },
  };

  function handleResponse(response: ExtensionUiResponseMessage): void {
    const entry = pending.get(response.requestId);
    if (!entry) return;

    pending.delete(response.requestId);
    entry.resolve(extractResult(entry.method, response));
  }

  return { wrappedUi, handleResponse, resendPending };
}
