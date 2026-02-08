/**
 * HEALTH SAFE GOLD — Normalizers v1.0
 *
 * Pure functions for mapping runtime values to SAFE GOLD states.
 * No Date, Math, UUID, or IO dependencies.
 */

import {
  SAFE_HEALTH_STATUSES,
  SAFE_HEALTH_VIEW_STATES,
  DEFAULT_HEALTH_STATUS,
  HEALTH_ALLOWED_ROLES,
  type SafeHealthStatus,
  type SafeHealthViewState,
  type HealthAllowedRole,
  type HealthAccessDenialReason,
} from '@/types/health-state';

/**
 * Normalize health view state from raw data.
 * Pure function — NO side effects, NO Date, NO exceptions.
 */
export function normalizeHealthViewState(input: unknown): SafeHealthViewState {
  if (input === null || input === undefined) return 'EMPTY';

  if (typeof input === 'string') {
    const upper = input.toUpperCase().trim();
    if (SAFE_HEALTH_VIEW_STATES.includes(upper as SafeHealthViewState)) {
      return upper as SafeHealthViewState;
    }
    if (upper === 'PENDING' || upper === 'FETCHING') return 'LOADING';
    if (upper === 'READY' || upper === 'SUCCESS') return 'OK';
    if (upper === 'FAILED' || upper === 'FAILURE') return 'ERROR';
    return 'OK';
  }

  if (Array.isArray(input)) return input.length === 0 ? 'EMPTY' : 'OK';

  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if (obj.error || obj.isError || obj.status === 'error') return 'ERROR';
    if (obj.loading || obj.isLoading) return 'LOADING';
    if ('data' in obj) return normalizeHealthViewState(obj.data);
    if (Object.keys(obj).length === 0) return 'EMPTY';
    return 'OK';
  }

  return input ? 'OK' : 'EMPTY';
}

/**
 * Normalize health status from raw string.
 */
export function normalizeHealthStatus(input: unknown): SafeHealthStatus {
  if (typeof input !== 'string') return DEFAULT_HEALTH_STATUS;

  const upper = input.toUpperCase().trim();

  if (SAFE_HEALTH_STATUSES.includes(upper as SafeHealthStatus)) {
    return upper as SafeHealthStatus;
  }

  // Map common aliases
  if (upper === 'HEALTHY' || upper === 'GOOD' || upper === 'UP') return 'OK';
  if (upper === 'WARNING' || upper === 'WARN' || upper === 'SLOW') return 'DEGRADED';
  if (upper === 'ERROR' || upper === 'DOWN' || upper === 'FAIL' || upper === 'FAILED') return 'CRITICAL';

  return DEFAULT_HEALTH_STATUS;
}

/**
 * Check if a role is allowed to access System Health.
 * Pure function — no side effects.
 */
export function isHealthAccessAllowed(role: string | null | undefined): boolean {
  if (!role) return false;
  const upper = role.toUpperCase().trim();
  return HEALTH_ALLOWED_ROLES.includes(upper as HealthAllowedRole);
}

/**
 * Determine denial reason for health access.
 * Pure function — no side effects.
 */
export function getHealthAccessDenialReason(
  isAuthenticated: boolean,
  role: string | null | undefined,
  isImpersonating: boolean
): HealthAccessDenialReason | null {
  if (!isAuthenticated) return 'NOT_AUTHENTICATED';
  if (isImpersonating) return 'IMPERSONATION_FORBIDDEN';
  if (!isHealthAccessAllowed(role)) return 'INSUFFICIENT_ROLE';
  return null;
}

/**
 * Check if current route is a health route.
 * Pure function — route-based detection only.
 */
export function isHealthRoute(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return lower === '/admin/health' || lower.startsWith('/admin/health/');
}

/**
 * Validate health status is in SAFE subset.
 */
export function isValidHealthStatus(v: unknown): v is SafeHealthStatus {
  if (typeof v !== 'string') return false;
  return SAFE_HEALTH_STATUSES.includes(v as SafeHealthStatus);
}

/**
 * Validate health view state is in SAFE subset.
 */
export function isValidHealthViewState(v: unknown): v is SafeHealthViewState {
  if (typeof v !== 'string') return false;
  return SAFE_HEALTH_VIEW_STATES.includes(v as SafeHealthViewState);
}
