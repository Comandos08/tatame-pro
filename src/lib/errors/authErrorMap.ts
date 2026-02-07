/**
 * ============================================================================
 * 🔐 AUTH ERROR MAP — Friendly Error Mapping for Authentication
 * ============================================================================
 * 
 * Maps Supabase auth error messages to i18n keys for user-friendly display.
 * 
 * SAFE GOLD PRINCIPLES:
 * - Pure function, no side effects
 * - Returns i18n keys, not hardcoded strings
 * - Extensible pattern matching
 * ============================================================================
 */

export interface AuthError {
  message?: string;
  status?: number;
  statusCode?: number;
  code?: string;
}

/**
 * Maps authentication errors to user-friendly i18n keys.
 * 
 * @param error - The error object from Supabase or network
 * @returns i18n key for the friendly error message
 */
export function getAuthErrorKey(error: AuthError | Error | unknown): string {
  if (!error) return 'auth.genericError';

  const err = error as AuthError;
  const message = err?.message?.toLowerCase() || '';
  const status = err?.status || err?.statusCode || 0;
  const code = err?.code?.toLowerCase() || '';

  // SignUp: Email already registered (Supabase returns 422 or specific message)
  if (
    message.includes('user already registered') ||
    message.includes('email already in use') ||
    code === 'user_already_exists'
  ) {
    return 'auth.alreadyRegistered';
  }

  // Login: Invalid credentials (Supabase returns 400)
  if (
    message.includes('invalid login credentials') ||
    message.includes('invalid email or password') ||
    code === 'invalid_credentials'
  ) {
    return 'auth.invalidCredentials';
  }

  // Email not confirmed
  if (
    message.includes('email not confirmed') ||
    code === 'email_not_confirmed'
  ) {
    return 'auth.emailNotConfirmed';
  }

  // Rate limiting
  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    status === 429
  ) {
    return 'auth.rateLimited';
  }

  // Network errors
  if (
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('networkerror') ||
    message.includes('fetch error') ||
    status === 0
  ) {
    return 'auth.networkError';
  }

  // Server errors (5xx)
  if (status >= 500) {
    return 'auth.serverError';
  }

  // Default fallback
  return 'auth.genericError';
}
