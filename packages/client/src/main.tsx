import React from "react";
import ReactDOM from "react-dom/client";
import { Router } from "wouter";
import App from "./App.js";
import { ThemeProvider } from "./components/ThemeProvider.js";
import { MobileProvider } from "./hooks/useMobile.js";
import "./index.css";
// KaTeX styles for LaTeX math rendering in MarkdownContent.
// See change: chat-markdown-local-images-and-math.
import "katex/dist/katex.min.css";

// UI primitive registry — see change: add-plugin-ui-primitive-registry.
// The dashboard registers each declared primitive synchronously at startup;
// plugin slot contributions look them up via `useUiPrimitive(key)`. Adding
// a key in shared/ui-primitives.ts requires adding a registration here.
import { UI_PRIMITIVE_KEYS } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/ui-primitives.js";
import {
  UiPrimitiveProvider,
  createUiPrimitiveRegistry,
  registerUiPrimitive,
} from "@blackbelt-technology/dashboard-plugin-runtime";
import { AgentCardShell } from "@blackbelt-technology/pi-dashboard-client-utils/AgentCardShell";
import { ConfirmDialog } from "@blackbelt-technology/pi-dashboard-client-utils/ConfirmDialog";
import { DialogPortal } from "@blackbelt-technology/pi-dashboard-client-utils/DialogPortal";
import { Popover } from "@blackbelt-technology/pi-dashboard-client-utils/Popover";
import { SearchableSelectDialog } from "@blackbelt-technology/pi-dashboard-client-utils/SearchableSelectDialog";
import { ZoomControls } from "@blackbelt-technology/pi-dashboard-client-utils/ZoomControls";
import { ActionList } from "@blackbelt-technology/pi-dashboard-client-utils/ActionList";
import { StatusPill } from "@blackbelt-technology/pi-dashboard-client-utils/StatusPill";
import {
  formatDuration,
  formatTokens,
} from "@blackbelt-technology/pi-dashboard-client-utils/agent-card-utils";
import { MarkdownContent } from "./components/MarkdownContent.js";
import { ModelSelector } from "./components/ModelSelector.js";

const primitiveRegistry = createUiPrimitiveRegistry();
registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.agentCard, AgentCardShell);
registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.markdownContent, MarkdownContent);
registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.confirmDialog, ConfirmDialog);
registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.dialogPortal, DialogPortal);
registerUiPrimitive(
  primitiveRegistry,
  UI_PRIMITIVE_KEYS.searchableSelectDialog,
  SearchableSelectDialog,
);
registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.zoomControls, ZoomControls);
registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.formatTokens, formatTokens);
registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.formatDuration, formatDuration);
registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.actionList, ActionList);
registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.statusPill, StatusPill);
registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.modelSelector, ModelSelector);
registerUiPrimitive(primitiveRegistry, UI_PRIMITIVE_KEYS.popover, Popover);

// Register service worker for PWA installability
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <UiPrimitiveProvider value={primitiveRegistry}>
      <Router>
        <ThemeProvider>
          <MobileProvider>
            <App />
          </MobileProvider>
        </ThemeProvider>
      </Router>
    </UiPrimitiveProvider>
  </React.StrictMode>
);
