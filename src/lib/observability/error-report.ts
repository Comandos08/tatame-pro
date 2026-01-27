/**
 * 🔐 Error Reporter — Centralized Error Handling
 * 
 * Captures and reports errors with context.
 * Currently logs to console, prepared for future Sentry integration.
 * 
 * @module src/lib/observability/error-report
 */

import { logger } from './logger';

interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  tenantId?: string;
  correlationId?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
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
 *     severity: 'high'
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
    severity: 'critical',
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
    severity: options?.status && options.status >= 500 ? 'high' : 'medium',
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

/**
 * Format error for user display.
 * Strips technical details and returns a user-friendly message.
 */
export function formatUserError(error: Error | unknown): string {
  if (error instanceof Error) {
    // Check for known error types
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      return 'Erro de conexão. Verifique sua internet e tente novamente.';
    }
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      return 'Sessão expirada. Faça login novamente.';
    }
    if (error.message.includes('403') || error.message.includes('Forbidden')) {
      return 'Você não tem permissão para realizar esta ação.';
    }
    if (error.message.includes('404') || error.message.includes('Not Found')) {
      return 'O recurso solicitado não foi encontrado.';
    }
    if (error.message.includes('500') || error.message.includes('Internal Server')) {
      return 'Erro no servidor. Tente novamente em alguns minutos.';
    }
    if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      return 'A operação demorou muito. Tente novamente.';
    }
  }
  
  return 'Ocorreu um erro inesperado. Tente novamente.';
}
