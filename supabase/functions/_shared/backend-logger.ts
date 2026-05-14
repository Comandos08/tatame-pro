/**
 * A02 — Institutional Backend Logger (SAFE GOLD)
 *
 * Single point of output for ALL Edge Function logs.
 * Only this file may use `console.*` directly.
 *
 * Every other file MUST import `createBackendLogger` and use
 * the returned object for structured logging.
 *
 * Output: one JSON line per log entry, machine-parseable.
 *
 * As of 2026-05-14, `log.error(...)` also fires a fire-and-forget Sentry
 * event when `SENTRY_DSN_BACKEND` is configured — see `./sentry.ts`. The
 * Sentry call is wrapped in try/swallow so even a misbehaving observability
 * layer can never break the calling request path.
 */

import { captureBackendException } from "./sentry.ts";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogContext {
  fnName: string;
  correlationId: string;
  tenantId?: string | null;
  userId?: string | null;
  step?: string;
}

interface LogEntry {
  level: LogLevel;
  fn: string;
  cid: string;
  tid: string | null;
  uid: string | null;
  step: string | null;
  msg: string;
  data?: Record<string, unknown>;
  ts: string;
}

/**
 * Emit a single structured log line.
 * This is the ONLY place in the codebase that calls console.* directly.
 */
function emit(level: LogLevel, ctx: LogContext, message: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    fn: ctx.fnName,
    cid: ctx.correlationId,
    tid: ctx.tenantId ?? null,
    uid: ctx.userId ?? null,
    step: ctx.step ?? null,
    msg: message,
    ...(data && Object.keys(data).length > 0 ? { data } : {}),
    ts: new Date().toISOString(),
  };

  const line = JSON.stringify(entry);

  switch (level) {
    case "ERROR":
      console.error(line);
      break;
    case "WARN":
      console.warn(line);
      break;
    default:
      console.info(line);
      break;
  }
}

export interface BackendLogger {
  setTenant(tenantId: string | null): void;
  setUser(userId: string | null): void;
  setStep(step: string): void;
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, err?: unknown, data?: Record<string, unknown>): void;
}

/**
 * Create a scoped logger for an Edge Function invocation.
 *
 * @param fnName   - The Edge Function name (e.g. "grant-roles")
 * @param correlationId - Request correlation ID (from extractCorrelationId)
 */
export function createBackendLogger(fnName: string, correlationId: string): BackendLogger {
  const ctx: LogContext = { fnName, correlationId };

  return {
    setTenant(tenantId: string | null) {
      ctx.tenantId = tenantId;
    },

    setUser(userId: string | null) {
      ctx.userId = userId;
    },

    setStep(step: string) {
      ctx.step = step;
    },

    debug(msg: string, data?: Record<string, unknown>) {
      emit("DEBUG", ctx, msg, data);
    },

    info(msg: string, data?: Record<string, unknown>) {
      emit("INFO", ctx, msg, data);
    },

    warn(msg: string, data?: Record<string, unknown>) {
      emit("WARN", ctx, msg, data);
    },

    error(msg: string, err?: unknown, data?: Record<string, unknown>) {
      const errData: Record<string, unknown> =
        err instanceof Error
          ? { error_name: err.name, error_message: err.message }
          : err !== undefined
            ? { error_raw: String(err) }
            : {};
      emit("ERROR", ctx, msg, { ...errData, ...data });

      // Fire-and-forget Sentry event. No-op when SENTRY_DSN_BACKEND is
      // unset; never throws regardless. The structured JSON log above is
      // the source of truth — Sentry is just an indexed/searchable
      // mirror with alerting on top.
      try {
        captureBackendException(err ?? new Error(msg), {
          fn: ctx.fnName,
          correlationId: ctx.correlationId,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          extra: { log_message: msg, step: ctx.step ?? undefined, ...(data ?? {}) },
        });
      } catch {
        // Sentry helper already swallows; this is a paranoid second net.
      }
    },
  };
}
