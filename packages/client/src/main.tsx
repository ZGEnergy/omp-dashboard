import React from "react";
import ReactDOM from "react-dom/client";
import { Router } from "wouter";
import App from "./App.js";
import { ThemeProvider } from "./components/ThemeProvider.js";
import { MobileProvider } from "./hooks/useMobile.js";
import "./index.css";

// Register service worker for PWA installability
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router>
      <ThemeProvider>
        <MobileProvider>
          <App />
        </MobileProvider>
      </ThemeProvider>
    </Router>
  </React.StrictMode>
);
