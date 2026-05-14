/**
 * Minimal fire-and-forget Sentry client for Supabase Edge Functions.
 *
 * Intentionally does NOT depend on @sentry/deno or any other SDK — Deno
 * Deploy's runtime constraints have historically tripped up those SDKs and
 * a misbehaving observability layer is worse than no observability layer.
 * Instead we hand-roll the smallest possible client that POSTs to Sentry's
 * legacy /store/ endpoint (still supported and stable). About 60 lines of
 * code, zero transitive deps, and every failure mode swallowed so the
 * calling Edge Function path is never affected.
 *
 * Activation: set `SENTRY_DSN_BACKEND` in the Supabase function secrets.
 * Leave unset (the default) to keep the helper a true no-op.
 *
 * Wired centrally via `backend-logger.ts` — every `log.error(...)` call
 * across the 68 Edge Functions also fires a Sentry event when the DSN is
 * configured. No per-function changes required.
 */

const dsn = Deno.env.get("SENTRY_DSN_BACKEND") ?? "";

let endpoint: string | null = null;
let publicKey: string | null = null;

if (dsn) {
  try {
    // DSN format: https://<publicKey>@<host>/<projectId>
    const parsed = new URL(dsn);
    publicKey = parsed.username;
    const projectId = parsed.pathname.replace(/^\//, "");
    if (publicKey && projectId) {
      endpoint = `${parsed.protocol}//${parsed.host}/api/${projectId}/store/`;
    }
  } catch {
    // Malformed DSN — stay inert. We deliberately do not log this because
    // backend-logger.ts is what calls us; logging from inside the logger
    // would recurse forever the moment the DSN is wrong.
  }
}

const isEnabled = Boolean(endpoint && publicKey);

export interface SentryContext {
  /** Function name (e.g. "stripe-webhook") */
  fn?: string;
  /** Correlation ID propagated through the request */
  correlationId?: string;
  /** Tenant scope, if known */
  tenantId?: string | null;
  /** User scope, if known */
  userId?: string | null;
  /** Sentry level (default: "error") */
  level?: "fatal" | "error" | "warning" | "info" | "debug";
  /** Free-form extra context that lands in the event "extra" section */
  extra?: Record<string, unknown>;
  /** Tags used for filtering in the Sentry UI */
  tags?: Record<string, string>;
}

/**
 * Capture an exception or arbitrary value as a Sentry event.
 *
 * Fire-and-forget. Never throws. Returns immediately when the DSN is not
 * configured — safe to call from any code path including the error path
 * itself.
 */
export function captureBackendException(error: unknown, context: SentryContext = {}): void {
  if (!isEnabled) return;
  // Fire-and-forget. We do not await because the Deno Edge Function might
  // be torn down before resolution; the worst case is a lost event, never
  // a delayed response to the caller.
  void sendEvent(error, context).catch(() => { /* swallow */ });
}

async function sendEvent(error: unknown, context: SentryContext): Promise<void> {
  if (!endpoint || !publicKey) return;

  const err = error instanceof Error ? error : new Error(String(error ?? "Unknown error"));

  const stackFrames = err.stack
    ? err.stack
        .split("\n")
        .slice(1)
        .map((line) => {
          const trimmed = line.trim();
          const m = trimmed.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
          if (m) {
            const [, fn, filename, lineno, colno] = m;
            return {
              function: fn ?? "<anonymous>",
              filename,
              lineno: Number(lineno),
              colno: Number(colno),
              in_app: !filename.includes("node_modules") && !filename.startsWith("https://"),
            };
          }
          return { filename: trimmed };
        })
        // Sentry expects frames in reverse order (oldest first, crashing
        // frame last). The split gives us newest first.
        .reverse()
    : undefined;

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "javascript",
    level: context.level ?? "error",
    environment: Deno.env.get("DENO_DEPLOYMENT_ID") ? "production" : "development",
    server_name: context.fn ?? "edge-function",
    release: Deno.env.get("SENTRY_RELEASE") ?? Deno.env.get("DENO_DEPLOYMENT_ID") ?? undefined,
    exception: {
      values: [
        {
          type: err.name || "Error",
          value: err.message,
          ...(stackFrames ? { stacktrace: { frames: stackFrames } } : {}),
        },
      ],
    },
    tags: {
      function: context.fn ?? "unknown",
      ...(context.tags ?? {}),
    },
    user: context.userId ? { id: context.userId } : undefined,
    extra: {
      ...(context.correlationId ? { correlation_id: context.correlationId } : {}),
      ...(context.tenantId ? { tenant_id: context.tenantId } : {}),
      ...(context.extra ?? {}),
    },
  };

  try {
    // Time out fast — the request must never block tear-down for long.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=tatame-edge/1.0`,
        },
        body: JSON.stringify(event),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    /* swallow — observability layer must never break the request path */
  }
}

/** Exposed for tests / introspection. True when SENTRY_DSN_BACKEND is set and parseable. */
export const sentryBackendEnabled = isEnabled;
