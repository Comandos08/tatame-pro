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

// Institutional Error Contract (PI E2)
export {
  ERROR_CATALOG,
  getInstitutionalError,
  validateErrorCatalogKeys,
  type ErrorSeverity,
  type ErrorContext,
  type InstitutionalError,
} from './institutionalErrors';
