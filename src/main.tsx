import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AppProviders } from "@/contexts/AppProviders";

// Sentry — initialize if DSN is configured via VITE_SENTRY_DSN env var
if (
  import.meta.env.VITE_SENTRY_DSN &&
  typeof window !== "undefined" &&
  (window as unknown as Record<string, unknown>)["Sentry"]
) {
  ((window as unknown as Record<string, unknown>)["Sentry"] as { init: (opts: Record<string, unknown>) => void }).init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: (import.meta.env.VITE_APP_VERSION as string) || "unknown",
    tracesSampleRate: 0.1,
  });
}

import "@/index.css";
import "@/styles/a11y.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProviders>
        <App />
      </AppProviders>
    </BrowserRouter>
  </React.StrictMode>,
);
