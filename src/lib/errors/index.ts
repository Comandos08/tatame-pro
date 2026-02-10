/**
 * 🚨 Error Utilities — Centralized Error Handling
 */

export {
  TEMPORARY_ERROR_MAP,
  TEMPORARY_ERROR_TYPES,
  type TemporaryErrorType,
  type TemporaryErrorConfig,
} from './temporaryErrorMap';

// Auth error mapping
export { getAuthErrorKey, type AuthError } from './authErrorMap';

// Institutional Error Contract (PI E2 / PI U6)
export {
  ERROR_CATALOG,
  getInstitutionalError,
  validateErrorCatalogKeys,
  validateErrorCatalogIntegrity,
  type InstitutionalError,
} from './institutionalErrors';

// Re-export canonical types for consumer convenience (PI U6)
export type { Severity, ObservabilityDomain } from '@/lib/observability/types';
