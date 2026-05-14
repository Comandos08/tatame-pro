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

// After a deploy, the browser may still hold an older index.html that
// references chunks Vercel has already purged. Vite fires "vite:preloadError"
// whenever a dynamic import (React.lazy) 404s. We do one silent full reload
// to fetch the new index.html; if it still fails on the next attempt, the
// ErrorBoundary surfaces the error normally instead of looping forever.
const CHUNK_RELOAD_KEY = "tatame:chunk-reload-attempt";
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    try {
      if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    } catch {
      // sessionStorage unavailable (private mode, quota) — still try to reload.
    }
    event.preventDefault();
    window.location.reload();
  });
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

// Clear the reload guard a few seconds after a successful boot so a later
// stale-chunk event (another deploy mid-session) can also self-heal once.
if (typeof window !== "undefined") {
  setTimeout(() => {
    try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* noop */ }
  }, 5000);
}
