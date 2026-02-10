/**
 * 🔐 Error Reporter — Centralized Error Handling
 * 
 * Captures and reports errors with context.
 * Currently logs to console, prepared for future Sentry integration.
 * 
 * @module src/lib/observability/error-report
 */

import { logger } from './logger';

import type { Severity } from './types';

interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  tenantId?: string;
  correlationId?: string;
  /**
   * Canonical log severity (PI U5).
   * Uses Severity type: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'.
   * NOTE: This is NOT audit EventSeverity (LOW/MEDIUM/HIGH/CRITICAL).
   */
  severity?: Severity;
  metadata?: Record<string, unknown>;
}

interface ReportedError {
  id: string;
  timestamp: string;
  message: string;
  stack?: string;
  context: ErrorContext;
}

// In-memory buffer for recent errors (useful for debugging)
const errorBuffer: ReportedError[] = [];
const MAX_BUFFER_SIZE = 50;

/**
 * Generate a unique error ID.
 */
function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Report an error with context.
 * 
 * @example
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   reportError(error, {
 *     component: 'MembershipForm',
 *     action: 'submit',
 *     userId: user.id,
 *     severity: 'ERROR'
 *   });
 * }
 */
export function reportError(error: Error | unknown, context: ErrorContext = {}): string {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  const errorId = generateErrorId();
  
  const reportedError: ReportedError = {
    id: errorId,
    timestamp: new Date().toISOString(),
    message: errorObj.message,
    stack: errorObj.stack,
    context,
  };

  // Add to buffer
  errorBuffer.push(reportedError);
  if (errorBuffer.length > MAX_BUFFER_SIZE) {
    errorBuffer.shift();
  }

  // Log to console
  logger.error(
    `[${errorId}] ${errorObj.message}`,
    {
      ...context,
      errorId,
    },
    errorObj
  );

  // 🔮 Future: Send to Sentry or other error tracking service
  // if (window.Sentry) {
  //   window.Sentry.captureException(errorObj, { extra: context });
  // }

  return errorId;
}

/**
 * Report an error boundary catch.
 */
export function reportErrorBoundary(
  error: Error,
  errorInfo: React.ErrorInfo,
  component?: string
): string {
  return reportError(error, {
    component: component || 'ErrorBoundary',
    action: 'render',
    severity: 'CRITICAL',
    metadata: {
      componentStack: errorInfo.componentStack,
    },
  });
}

/**
 * Report a network/fetch error.
 */
export function reportNetworkError(
  error: Error,
  endpoint: string,
  options?: {
    method?: string;
    status?: number;
    correlationId?: string;
  }
): string {
  return reportError(error, {
    component: 'Network',
    action: 'fetch',
    severity: options?.status && options.status >= 500 ? 'ERROR' : 'WARN',
    correlationId: options?.correlationId,
    metadata: {
      endpoint,
      method: options?.method || 'GET',
      status: options?.status,
    },
  });
}

/**
 * Get recent errors from buffer (for debugging).
 */
export function getRecentErrors(): ReportedError[] {
  return [...errorBuffer];
}

/**
 * Clear error buffer.
 */
export function clearErrorBuffer(): void {
  errorBuffer.length = 0;
}

