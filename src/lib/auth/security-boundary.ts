/**
 * 🔐 SECURITY BOUNDARY — Centralized Security Decision Point
 * 
 * This module is the SINGLE POINT OF AUTHORITY for:
 * - 401 Unauthorized handling
 * - 403 Forbidden handling
 * - Session invalidation
 * - Token expiry
 * - Token revocation
 * 
 * SECURITY PRINCIPLES:
 * 1. No component individually decides logout/redirect/reset
 * 2. All security events flow through this boundary
 * 3. Single exit point for session cleanup
 * 4. Predictable, deterministic behavior
 * 
 * ARCHITECTURE:
 * This boundary receives security events and dispatches actions.
 * It does NOT directly interact with React state or navigation.
 * Instead, it returns action objects that callers execute.
 */

import { 
  isSessionExpiredError, 
  isUnauthorizedError, 
  isForbiddenError 
} from './auth-state-machine';
import { securityLogger } from '@/lib/observability/logger';

/**
 * Security event types that this boundary handles.
 */
export type SecurityEventType = 
  | 'SESSION_EXPIRED'
  | 'TOKEN_INVALID'
  | 'TOKEN_REVOKED'
  | 'UNAUTHORIZED_REQUEST'
  | 'FORBIDDEN_REQUEST'
  | 'REFRESH_FAILED'
  | 'NETWORK_ERROR'
  | 'LOGOUT_REQUESTED';

/**
 * Actions that the security boundary can return.
 */
export type SecurityAction = 
  | { type: 'CLEAR_SESSION' }
  | { type: 'REDIRECT'; destination: '/login' | '/portal' }
  | { type: 'SHOW_MESSAGE'; messageKey: string; severity: 'info' | 'warning' | 'error' }
  | { type: 'NOOP' };

/**
 * Security boundary decision result.
 */
export interface SecurityBoundaryDecision {
  actions: SecurityAction[];
  shouldClearSession: boolean;
  shouldRedirect: boolean;
  redirectTo: string | null;
  /** i18n key — resolve via t() at the call site */
  userMessageKey: string | null;
}

/**
 * Resolves a security event into a set of actions.
 * This is a PURE FUNCTION - no side effects.
 */
export function resolveSecurityEvent(
  event: SecurityEventType,
  context?: { currentPath?: string; isAuthenticated?: boolean }
): SecurityBoundaryDecision {
  const actions: SecurityAction[] = [];
  let shouldClearSession = false;
  let shouldRedirect = false;
  let redirectTo: string | null = null;
  let userMessageKey: string | null = null;

  switch (event) {
    case 'SESSION_EXPIRED':
      shouldClearSession = true;
      shouldRedirect = true;
      redirectTo = '/login';
      userMessageKey = 'security.boundary.sessionExpired';
      actions.push({ type: 'CLEAR_SESSION' });
      actions.push({ type: 'REDIRECT', destination: '/login' });
      actions.push({ type: 'SHOW_MESSAGE', messageKey: userMessageKey, severity: 'info' });
      break;

    case 'TOKEN_INVALID':
    case 'TOKEN_REVOKED':
      shouldClearSession = true;
      shouldRedirect = true;
      redirectTo = '/login';
      userMessageKey = 'security.boundary.sessionInvalidated';
      actions.push({ type: 'CLEAR_SESSION' });
      actions.push({ type: 'REDIRECT', destination: '/login' });
      actions.push({ type: 'SHOW_MESSAGE', messageKey: userMessageKey, severity: 'warning' });
      break;

    case 'UNAUTHORIZED_REQUEST':
      if (context?.isAuthenticated) {
        shouldClearSession = true;
        shouldRedirect = true;
        redirectTo = '/login';
        userMessageKey = 'security.boundary.authExpired';
        actions.push({ type: 'CLEAR_SESSION' });
        actions.push({ type: 'REDIRECT', destination: '/login' });
        actions.push({ type: 'SHOW_MESSAGE', messageKey: userMessageKey, severity: 'warning' });
      } else {
        shouldRedirect = true;
        redirectTo = '/login';
        actions.push({ type: 'REDIRECT', destination: '/login' });
      }
      break;

    case 'FORBIDDEN_REQUEST':
      shouldRedirect = true;
      redirectTo = '/portal';
      userMessageKey = 'security.boundary.forbidden';
      actions.push({ type: 'REDIRECT', destination: '/portal' });
      actions.push({ type: 'SHOW_MESSAGE', messageKey: userMessageKey, severity: 'warning' });
      break;

    case 'REFRESH_FAILED':
      shouldClearSession = true;
      shouldRedirect = true;
      redirectTo = '/login';
      userMessageKey = 'security.boundary.refreshFailed';
      actions.push({ type: 'CLEAR_SESSION' });
      actions.push({ type: 'REDIRECT', destination: '/login' });
      actions.push({ type: 'SHOW_MESSAGE', messageKey: userMessageKey, severity: 'info' });
      break;

    case 'NETWORK_ERROR':
      userMessageKey = 'security.boundary.networkError';
      actions.push({ type: 'SHOW_MESSAGE', messageKey: userMessageKey, severity: 'error' });
      break;

    case 'LOGOUT_REQUESTED':
      shouldClearSession = true;
      shouldRedirect = true;
      redirectTo = '/login';
      actions.push({ type: 'CLEAR_SESSION' });
      actions.push({ type: 'REDIRECT', destination: '/login' });
      break;

    default:
      securityLogger.warn('Unknown security event', { action: 'resolveSecurityEvent', event });
      actions.push({ type: 'NOOP' });
  }

  return {
    actions,
    shouldClearSession,
    shouldRedirect,
    redirectTo,
    userMessageKey,
  };
}

/**
 * Categorizes an error into a security event type.
 */
export function categorizeSecurityError(error: unknown): SecurityEventType | null {
  if (isSessionExpiredError(error)) {
    return 'SESSION_EXPIRED';
  }
  
  if (isUnauthorizedError(error)) {
    return 'UNAUTHORIZED_REQUEST';
  }
  
  if (isForbiddenError(error)) {
    return 'FORBIDDEN_REQUEST';
  }
  
  // Check for network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return 'NETWORK_ERROR';
  }
  
  return null;
}

/**
 * Determines the appropriate security action for an API error.
 */
export function handleApiSecurityError(
  error: unknown,
  context?: { currentPath?: string; isAuthenticated?: boolean }
): SecurityBoundaryDecision | null {
  const eventType = categorizeSecurityError(error);
  
  if (!eventType) {
    return null; // Not a security-related error
  }
  
  return resolveSecurityEvent(eventType, context);
}
