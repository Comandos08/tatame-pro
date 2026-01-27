/**
 * 🔐 AUTH MODULE — Enterprise Security Baseline
 * 
 * Central export point for all auth-related utilities.
 */

export {
  type AuthState,
  VALID_TRANSITIONS,
  isValidTransition,
  transitionAuthState,
  mapSupabaseEventToAuthState,
  isSessionExpiredError,
  isUnauthorizedError,
  isForbiddenError,
  type AuthTransitionResult,
} from './auth-state-machine';

export {
  type SecurityEventType,
  type SecurityAction,
  type SecurityBoundaryDecision,
  resolveSecurityEvent,
  categorizeSecurityError,
  handleApiSecurityError,
} from './security-boundary';
