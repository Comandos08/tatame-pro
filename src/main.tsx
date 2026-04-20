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

// Sentry — initialize if DSN is configured via VITE_SENTRY_DSN.
// Bundled as an npm dep but imported dynamically so the ~50KB gzipped chunk
// is only fetched when there is a DSN to send events to. Consumers
// (error-report.ts, web-vitals.ts) read window.Sentry, which we populate
// after the SDK resolves.
if (import.meta.env.VITE_SENTRY_DSN && typeof window !== "undefined") {
  import("@sentry/react")
    .then((Sentry) => {
      Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.MODE,
        release: (import.meta.env.VITE_APP_VERSION as string) || "unknown",
        tracesSampleRate: 0.1,
      });
      (window as unknown as Record<string, unknown>)["Sentry"] = Sentry;
    })
    .catch((err) => {
      // Chunk fetch failed (network error, blocked by extension, etc.).
      // App continues normally; in-memory error buffer still collects.
      console.warn("[Sentry] Failed to load SDK — error tracking disabled.", err);
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
