/**
 * 📊 PI-A02 — Institutional Logger (SAFE GOLD)
 *
 * Environment-aware logger with variadic arguments.
 * - DEV: all levels emitted
 * - PROD: only WARN, ERROR emitted
 * - TEST: suppressed
 *
 * This is the canonical import for all application code.
 * For scoped/structured logging, use createLogger from '@/lib/observability/logger'.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const isTest = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';
const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
const MIN_LEVEL: LogLevel = isDev ? 'debug' : 'warn';

function shouldLog(level: LogLevel): boolean {
  if (isTest) return false;
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LEVEL];
}

export const logger = {
  debug(...args: unknown[]): void {
    if (shouldLog('debug')) {
      console.debug(...args);
    }
  },

  log(...args: unknown[]): void {
    if (shouldLog('info')) {
      console.log(...args);
    }
  },

  info(...args: unknown[]): void {
    if (shouldLog('info')) {
      console.info(...args);
    }
  },

  warn(...args: unknown[]): void {
    if (shouldLog('warn')) {
      console.warn(...args);
    }
  },

  error(...args: unknown[]): void {
    if (shouldLog('error')) {
      console.error(...args);
    }
  },
};

// Re-export structured logger for scoped use
export { createLogger, authLogger, routerLogger, networkLogger, securityLogger, auditLogger, realtimeLogger } from '@/lib/observability/logger';
