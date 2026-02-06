/**
 * ============================================================================
 * 🚨 TEMPORARY ERROR MAP — UX Configuration for Transient Errors
 * ============================================================================
 * 
 * P2.5: Deterministic mapping of temporary error types to UX configuration.
 * 
 * SAFE GOLD PRINCIPLES:
 * - NO domain logic
 * - NO fetch calls
 * - NO automatic recovery
 * - Pure data mapping for UX presentation
 * ============================================================================
 */

/**
 * Const array of all valid temporary error types.
 * Used for compile-time safety and autocomplete.
 */
export const TEMPORARY_ERROR_TYPES = [
  'NETWORK',
  'TIMEOUT',
  'SERVER',
  'RATE_LIMIT',
  'UNKNOWN',
] as const;

export type TemporaryErrorType = typeof TEMPORARY_ERROR_TYPES[number];

export interface TemporaryErrorConfig {
  /** i18n key for error title */
  titleKey: string;
  /** i18n key for error description */
  descriptionKey: string;
  /** i18n key for reassurance message (optional) */
  reassuranceKey?: string;
  /** i18n key for primary action button */
  primaryActionKey: string;
  /** i18n key for secondary action button (optional) */
  secondaryActionKey?: string;
}

/**
 * Mapping of temporary error types to their UX configuration.
 * All keys reference i18n entries for full localization support.
 */
export const TEMPORARY_ERROR_MAP: Record<TemporaryErrorType, TemporaryErrorConfig> = {
  NETWORK: {
    titleKey: 'errors.network.title',
    descriptionKey: 'errors.network.desc',
    reassuranceKey: 'errors.network.reassurance',
    primaryActionKey: 'common.retryNow',
  },
  TIMEOUT: {
    titleKey: 'errors.timeout.title',
    descriptionKey: 'errors.timeout.desc',
    reassuranceKey: 'errors.timeout.reassurance',
    primaryActionKey: 'common.retryNow',
  },
  SERVER: {
    titleKey: 'errors.server.title',
    descriptionKey: 'errors.server.desc',
    reassuranceKey: 'errors.server.reassurance',
    primaryActionKey: 'common.retryNow',
    secondaryActionKey: 'common.contactSupport',
  },
  RATE_LIMIT: {
    titleKey: 'errors.rateLimit.title',
    descriptionKey: 'errors.rateLimit.desc',
    reassuranceKey: 'errors.rateLimit.reassurance',
    primaryActionKey: 'common.waitAndRetry',
  },
  UNKNOWN: {
    titleKey: 'errors.generic.title',
    descriptionKey: 'errors.generic.desc',
    primaryActionKey: 'common.retryNow',
  },
};
