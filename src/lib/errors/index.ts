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
