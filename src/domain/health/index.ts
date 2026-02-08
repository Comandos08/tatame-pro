/**
 * HEALTH SAFE GOLD — Barrel Export v1.0
 */

// Types
export type {
  SafeHealthStatus,
  SafeHealthViewState,
  HealthAllowedRole,
  HealthAccessDenialReason,
  HealthProtectedTable,
} from '@/types/health-state';

export {
  SAFE_HEALTH_STATUSES,
  SAFE_HEALTH_VIEW_STATES,
  HEALTH_ACCESS_RULE,
  HEALTH_ALLOWED_ROLES,
  HEALTH_ACCESS_DENIAL_REASONS,
  HEALTH_PROTECTED_TABLES,
  DEFAULT_HEALTH_STATUS,
  DEFAULT_HEALTH_VIEW_STATE,
  isHealthProtectedTable,
} from '@/types/health-state';

// Normalizers
export {
  normalizeHealthViewState,
  normalizeHealthStatus,
  isHealthAccessAllowed,
  getHealthAccessDenialReason,
  isHealthRoute,
  isValidHealthStatus,
  isValidHealthViewState,
} from './normalize';
