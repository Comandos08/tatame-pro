import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AppProviders } from "@/contexts/AppProviders";

// Critical env var validation — fail fast with a clear message rather than
// a cryptic Supabase client error buried deep in the call stack.
const REQUIRED_ENV_VARS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'] as const;
const missingEnvVars = REQUIRED_ENV_VARS.filter(
  key => !import.meta.env[key]
);
if (missingEnvVars.length > 0) {
  document.body.innerHTML = `<pre style="padding:2rem;color:red;font-family:monospace">
[Tatame Pro] Missing required environment variables:\n${missingEnvVars.join('\n')}

Set these in your .env file or hosting environment and restart.
  </pre>`;
  throw new Error(`Missing required env vars: ${missingEnvVars.join(', ')}`);
}

// Sentry — initialize if DSN is configured via VITE_SENTRY_DSN env var.
// Loaded from CDN in index.html; defer to "load" event to avoid race with async script.
if (import.meta.env.VITE_SENTRY_DSN && typeof window !== "undefined") {
  window.addEventListener("load", () => {
    const sentry = (window as unknown as Record<string, unknown>)["Sentry"] as
      | { init: (opts: Record<string, unknown>) => void }
      | undefined;
    if (sentry?.init) {
      sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.MODE,
        release: (import.meta.env.VITE_APP_VERSION as string) || "unknown",
        tracesSampleRate: 0.1,
      });
    } else {
      // Sentry SDK not available — CDN may have been blocked or failed to load.
      // App continues normally; errors will not be reported to Sentry.
      console.warn("[Sentry] SDK not available after page load — error tracking disabled.");
    }
  });
}

import { initWebVitals } from "@/lib/observability/web-vitals";
import "@/index.css";
import "@/styles/a11y.css";

// Web Vitals — track Core Web Vitals (LCP, CLS, INP, FCP, TTFB)
initWebVitals();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProviders>
        <App />
      </AppProviders>
    </BrowserRouter>
  </React.StrictMode>,
);
