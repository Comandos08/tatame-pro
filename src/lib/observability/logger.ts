/**
 * 🔐 Logger — Observability Layer
 * 
 * Environment-aware logging with structured output.
 * In production: only error/warn
 * In development: all levels
 * 
 * @module src/lib/observability/logger
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  component?: string;
  action?: string;
  userId?: string;
  tenantId?: string;
  correlationId?: string;
  [key: string]: unknown;
}

interface Logger {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext, error?: Error) => void;
}

const isDev = import.meta.env.DEV;
const isTest = import.meta.env.MODE === 'test';

/**
 * Format log entry with timestamp and context.
 */
function formatLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext
): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  
  if (context && Object.keys(context).length > 0) {
    return `${prefix} ${message} ${JSON.stringify(context)}`;
  }
  
  return `${prefix} ${message}`;
}

/**
 * Get log method based on level.
 */
function getConsoleMethod(level: LogLevel): (...args: unknown[]) => void {
  switch (level) {
    case 'debug':
      return console.debug;
    case 'info':
      return console.info;
    case 'warn':
      return console.warn;
    case 'error':
      return console.error;
    default:
      return console.log;
  }
}

/**
 * Check if level should be logged based on environment.
 */
function shouldLog(level: LogLevel): boolean {
  // Always suppress in test environment unless explicitly enabled
  if (isTest) return false;
  
  // In production, only warn and error
  if (!isDev) {
    return level === 'warn' || level === 'error';
  }
  
  // In dev, log everything
  return true;
}

/**
 * Create a scoped logger for a specific component/module.
 * 
 * @example
 * const log = createLogger('PortalRouter');
 * log.info('Resolving destination', { userId: user.id });
 */
export function createLogger(scope: string): Logger {
  const log = (level: LogLevel, message: string, context?: LogContext, error?: Error) => {
    if (!shouldLog(level)) return;
    
    const scopedContext = { ...context, component: scope };
    const formatted = formatLogEntry(level, message, scopedContext);
    const method = getConsoleMethod(level);
    
    if (error) {
      method(formatted, error);
    } else {
      method(formatted);
    }
  };

  return {
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context, error) => log('error', message, context, error),
  };
}

/**
 * Default application logger.
 */
export const logger = createLogger('App');

/**
 * Auth-specific logger for tracking authentication state transitions.
 */
export const authLogger = createLogger('Auth');

/**
 * Router-specific logger for navigation decisions.
 */
export const routerLogger = createLogger('Router');

/**
 * Network-specific logger for API calls.
 */
export const networkLogger = createLogger('Network');

/**
 * Security-specific logger for security boundary events.
 */
export const securityLogger = createLogger('Security');

/**
 * Audit-specific logger for audit trail events.
 */
export const auditLogger = createLogger('Audit');

/**
 * Realtime-specific logger for subscription events.
 */
export const realtimeLogger = createLogger('Realtime');
