import { useState, useCallback, useEffect, useRef } from "react";
import { getApiBase } from "../lib/api-context.js";
import type { PackageProgressMessage, PackageOperationCompleteMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";

export type PackageOperationStatus = "idle" | "running" | "success" | "error";

export interface OperationState {
  operationId: string | null;
  status: PackageOperationStatus;
  message: string;
  source: string;
}

export function usePackageOperations(
  scope: "global" | "local",
  cwd?: string,
  onComplete?: () => void,
) {
  const [operation, setOperation] = useState<OperationState>({
    operationId: null,
    status: "idle",
    message: "",
    source: "",
  });
  const opIdRef = useRef<string | null>(null);

  const startOperation = useCallback(
    async (action: "install" | "remove" | "update", source: string) => {
      try {
        const res = await fetch(`${getApiBase()}/api/packages/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source, scope, cwd }),
        });
        const body = await res.json();
        if (!body.success) {
          setOperation({ operationId: null, status: "error", message: body.error, source });
          return;
        }
        const opId = body.data.operationId;
        opIdRef.current = opId;
        setOperation({ operationId: opId, status: "running", message: "Starting...", source });
      } catch (err: any) {
        setOperation({ operationId: null, status: "error", message: err.message, source });
      }
    },
    [scope, cwd],
  );

  const install = useCallback((source: string) => startOperation("install", source), [startOperation]);
  const remove = useCallback((source: string) => startOperation("remove", source), [startOperation]);
  const update = useCallback((source: string) => startOperation("update", source), [startOperation]);

  const clearOperation = useCallback(() => {
    opIdRef.current = null;
    setOperation({ operationId: null, status: "idle", message: "", source: "" });
  }, []);

  /** Handle a WebSocket message — call from useMessageHandler. */
  const handleMessage = useCallback(
    (msg: PackageProgressMessage | PackageOperationCompleteMessage) => {
      if (msg.type === "package_progress") {
        if (msg.operationId !== opIdRef.current) return;
        setOperation((prev) => ({
          ...prev,
          message: msg.event.message ?? `${msg.event.action}: ${msg.event.type}`,
        }));
      } else if (msg.type === "package_operation_complete") {
        if (msg.operationId !== opIdRef.current) return;
        setOperation({
          operationId: msg.operationId,
          status: msg.success ? "success" : "error",
          message: msg.success
            ? `${msg.action} complete${msg.sessionsReloaded ? ` (${msg.sessionsReloaded} sessions reloaded)` : ""}`
            : msg.error ?? "Operation failed",
          source: msg.source,
        });
        // Auto-clear after success
        if (msg.success) {
          onComplete?.();
          setTimeout(() => {
            if (opIdRef.current === msg.operationId) clearOperation();
          }, 3000);
        }
      }
    },
    [clearOperation, onComplete],
  );

  // Listen for package events from WebSocket (dispatched via custom DOM event)
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (msg?.type === "package_progress" || msg?.type === "package_operation_complete") {
        handleMessage(msg);
      }
    };
    window.addEventListener("pi-package-event", handler);
    return () => {
      window.removeEventListener("pi-package-event", handler);
      opIdRef.current = null;
    };
  }, [handleMessage]);

  return {
    operation,
    install,
    remove,
    update,
    clearOperation,
    handleMessage,
  };
}
