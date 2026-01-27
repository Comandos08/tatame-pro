/**
 * 🔐 AUTH STATE MACHINE — Enterprise Security Baseline
 * 
 * This module defines the FORMAL authentication state machine.
 * ALL components MUST use this contract for auth decisions.
 * 
 * STATE MACHINE RULES:
 * 1. Only valid transitions are allowed
 * 2. No implicit states
 * 3. Single source of truth
 * 4. All transitions are logged
 * 
 * SECURITY PRINCIPLES:
 * - Deny by default
 * - Fail closed
 * - No ambiguous states
 */

/**
 * Valid authentication states.
 * These are the ONLY states the system can be in.
 */
export type AuthState = 
  | 'unauthenticated'   // No session, no user
  | 'authenticating'    // Session check or login in progress
  | 'authenticated'     // Valid session, user loaded
  | 'expired'           // Session expired, requires re-auth
  | 'error';            // Auth system error

/**
 * Transition matrix defining valid state changes.
 * Any transition NOT in this matrix is a BUG.
 */
export const VALID_TRANSITIONS: Record<AuthState, AuthState[]> = {
  unauthenticated: ['authenticating'],
  authenticating: ['authenticated', 'error', 'unauthenticated'],
  authenticated: ['expired', 'unauthenticated'],
  expired: ['unauthenticated', 'authenticating'],
  error: ['unauthenticated', 'authenticating'],
};

/**
 * Validates if a state transition is allowed.
 * @returns true if transition is valid
 */
export function isValidTransition(from: AuthState, to: AuthState): boolean {
  if (from === to) return true; // Self-transition always valid
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Auth state transition result
 */
export interface AuthTransitionResult {
  success: boolean;
  from: AuthState;
  to: AuthState;
  reason?: string;
}

/**
 * Safely transitions between auth states.
 * Logs invalid transitions and returns failure.
 */
export function transitionAuthState(
  currentState: AuthState,
  targetState: AuthState,
  context?: string
): AuthTransitionResult {
  const isValid = isValidTransition(currentState, targetState);
  
  if (!isValid) {
    console.error(
      `[AuthStateMachine] INVALID TRANSITION: ${currentState} → ${targetState}`,
      context ? `Context: ${context}` : ''
    );
  }
  
  return {
    success: isValid,
    from: currentState,
    to: targetState,
    reason: isValid ? undefined : `Invalid transition from ${currentState} to ${targetState}`,
  };
}

/**
 * Maps Supabase auth events to auth state.
 * This is the ONLY place where Supabase events are interpreted.
 */
export function mapSupabaseEventToAuthState(
  event: string,
  hasSession: boolean,
  hasUser: boolean
): AuthState {
  switch (event) {
    case 'SIGNED_IN':
    case 'TOKEN_REFRESHED':
    case 'USER_UPDATED':
      return hasSession && hasUser ? 'authenticated' : 'authenticating';
    
    case 'SIGNED_OUT':
      return 'unauthenticated';
    
    case 'PASSWORD_RECOVERY':
      return 'authenticating';
    
    case 'INITIAL_SESSION':
      if (hasSession && hasUser) return 'authenticated';
      if (!hasSession) return 'unauthenticated';
      return 'authenticating';
    
    default:
      // Unknown event - fail safe to unauthenticated
      console.warn(`[AuthStateMachine] Unknown auth event: ${event}`);
      return 'unauthenticated';
  }
}

/**
 * Determines if an error indicates session expiry.
 */
export function isSessionExpiredError(error: unknown): boolean {
  if (!error) return false;
  
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode = (error as { code?: string })?.code;
  
  const expiryIndicators = [
    'JWT expired',
    'session_expired',
    'refresh_token_not_found',
    'Invalid Refresh Token',
    'PGRST301', // PostgREST JWT error
  ];
  
  return expiryIndicators.some(
    indicator => 
      errorMessage.includes(indicator) || 
      errorCode === indicator
  );
}

/**
 * Determines if an error is a 401 Unauthorized.
 */
export function isUnauthorizedError(error: unknown): boolean {
  if (!error) return false;
  
  const status = (error as { status?: number })?.status;
  const code = (error as { code?: string | number })?.code;
  
  return status === 401 || code === 401 || code === '401';
}

/**
 * Determines if an error is a 403 Forbidden.
 */
export function isForbiddenError(error: unknown): boolean {
  if (!error) return false;
  
  const status = (error as { status?: number })?.status;
  const code = (error as { code?: string | number })?.code;
  
  return status === 403 || code === 403 || code === '403';
}
