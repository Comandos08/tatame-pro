/**
 * 🏛️ Institutional Error Contract — PI E2
 * 
 * Canonical error vocabulary for the platform.
 * SAFE GOLD: Read-only contract. No flow decisions.
 * 
 * Rules:
 * - Every error MUST have a code, messageKey, and severity
 * - No hardcoded messages — always i18n
 * - No technical details exposed to users
 * - DEV warnings for missing keys (zero PROD impact)
 */

// ============================================
// TYPES
// ============================================

export type ErrorSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type ErrorContext = 'AUTH' | 'ACCESS' | 'BILLING' | 'SYSTEM' | 'DATA' | 'UNKNOWN';

export interface InstitutionalError {
  code: string;
  messageKey: string;
  severity: ErrorSeverity;
  httpStatus?: number;
  retryable?: boolean;
  context: ErrorContext;
}

// ============================================
// CANONICAL ERROR CATALOG (v1)
// ============================================

export const ERROR_CATALOG: Record<string, InstitutionalError> = {
  // 🔐 Authentication / Identity
  'AUTH-001': {
    code: 'AUTH-001',
    messageKey: 'institutionalErrors.AUTH-001',
    severity: 'ERROR',
    httpStatus: 401,
    retryable: false,
    context: 'AUTH',
  },
  'AUTH-002': {
    code: 'AUTH-002',
    messageKey: 'institutionalErrors.AUTH-002',
    severity: 'ERROR',
    httpStatus: 401,
    retryable: true,
    context: 'AUTH',
  },
  'AUTH-003': {
    code: 'AUTH-003',
    messageKey: 'institutionalErrors.AUTH-003',
    severity: 'WARNING',
    httpStatus: 403,
    retryable: false,
    context: 'AUTH',
  },
  'AUTH-004': {
    code: 'AUTH-004',
    messageKey: 'institutionalErrors.AUTH-004',
    severity: 'ERROR',
    httpStatus: 403,
    retryable: false,
    context: 'AUTH',
  },

  // 🧑‍⚖️ Authorization / Access
  'ACCESS-001': {
    code: 'ACCESS-001',
    messageKey: 'institutionalErrors.ACCESS-001',
    severity: 'ERROR',
    httpStatus: 403,
    retryable: false,
    context: 'ACCESS',
  },
  'ACCESS-002': {
    code: 'ACCESS-002',
    messageKey: 'institutionalErrors.ACCESS-002',
    severity: 'ERROR',
    httpStatus: 403,
    retryable: false,
    context: 'ACCESS',
  },
  'ACCESS-003': {
    code: 'ACCESS-003',
    messageKey: 'institutionalErrors.ACCESS-003',
    severity: 'ERROR',
    httpStatus: 403,
    retryable: false,
    context: 'ACCESS',
  },
  'ACCESS-004': {
    code: 'ACCESS-004',
    messageKey: 'institutionalErrors.ACCESS-004',
    severity: 'CRITICAL',
    httpStatus: 403,
    retryable: false,
    context: 'ACCESS',
  },

  // 💳 Billing
  'BILLING-001': {
    code: 'BILLING-001',
    messageKey: 'institutionalErrors.BILLING-001',
    severity: 'WARNING',
    retryable: false,
    context: 'BILLING',
  },
  'BILLING-002': {
    code: 'BILLING-002',
    messageKey: 'institutionalErrors.BILLING-002',
    severity: 'ERROR',
    retryable: false,
    context: 'BILLING',
  },
  'BILLING-003': {
    code: 'BILLING-003',
    messageKey: 'institutionalErrors.BILLING-003',
    severity: 'ERROR',
    retryable: false,
    context: 'BILLING',
  },

  // 🩺 System / Health
  'SYS-001': {
    code: 'SYS-001',
    messageKey: 'institutionalErrors.SYS-001',
    severity: 'ERROR',
    httpStatus: 503,
    retryable: true,
    context: 'SYSTEM',
  },
  'SYS-002': {
    code: 'SYS-002',
    messageKey: 'institutionalErrors.SYS-002',
    severity: 'WARNING',
    retryable: true,
    context: 'SYSTEM',
  },
  'SYS-003': {
    code: 'SYS-003',
    messageKey: 'institutionalErrors.SYS-003',
    severity: 'CRITICAL',
    httpStatus: 500,
    retryable: false,
    context: 'SYSTEM',
  },
  'SYS-004': {
    code: 'SYS-004',
    messageKey: 'institutionalErrors.SYS-004',
    severity: 'INFO',
    retryable: false,
    context: 'SYSTEM',
  },

  // 📦 Data / Consistency
  'DATA-001': {
    code: 'DATA-001',
    messageKey: 'institutionalErrors.DATA-001',
    severity: 'ERROR',
    httpStatus: 404,
    retryable: false,
    context: 'DATA',
  },
  'DATA-002': {
    code: 'DATA-002',
    messageKey: 'institutionalErrors.DATA-002',
    severity: 'ERROR',
    retryable: false,
    context: 'DATA',
  },
  'DATA-003': {
    code: 'DATA-003',
    messageKey: 'institutionalErrors.DATA-003',
    severity: 'WARNING',
    retryable: false,
    context: 'DATA',
  },
};

// ============================================
// HELPER
// ============================================

/**
 * Returns the canonical InstitutionalError for a given code.
 * Falls back to SYS-003 (critical system failure) if code is unknown.
 * DEV-only: warns on unknown codes.
 */
export function getInstitutionalError(code: string): InstitutionalError {
  const entry = ERROR_CATALOG[code];

  if (!entry && !import.meta.env.PROD) {
    console.warn(
      `[Institutional Error] ⚠️ Unknown error code "${code}". ` +
      `Falling back to SYS-003. Add this code to src/lib/errors/institutionalErrors.ts.`
    );
  }

  return entry ?? ERROR_CATALOG['SYS-003'];
}

/**
 * DEV-only: validates that all error catalog messageKeys exist in the i18n dictionary.
 * Call once at app startup in development.
 */
export function validateErrorCatalogKeys(t: (key: string) => string): void {
  if (import.meta.env.PROD) return;

  for (const [code, error] of Object.entries(ERROR_CATALOG)) {
    const translated = t(error.messageKey);
    if (!translated || translated === error.messageKey) {
      console.warn(
        `[Institutional Error] ⚠️ Missing i18n key "${error.messageKey}" for error code "${code}". ` +
        `Add it to your locale files.`
      );
    }
  }
}
