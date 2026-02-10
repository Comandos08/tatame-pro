/**
 * 🏛️ Institutional Error Catalog — PI E2 / PI U6
 *
 * FROZEN CONTRACT (PI U6)
 *
 * REGRAS ABSOLUTAS:
 * - Nenhum erro pode existir fora deste catálogo
 * - ACCESS e DATA NÃO existem mais como domínio
 *   - Autorização/permissão/policy -> ObservabilityDomain.SECURITY
 *   - Persistência/consistência -> ObservabilityDomain.SYSTEM
 * - Severity usa EXCLUSIVAMENTE Severity canônico (PI U5)
 * - Após U6, este catálogo é fonte obrigatória para:
 *   - SecurityBoundary
 *   - error-report.ts
 *   - Qualquer erro institucional exibido ao usuário
 * - Nenhum novo erro pode ser criado fora deste catálogo
 *
 * Rules:
 * - Every error MUST have a code, messageKey, severity, domain
 * - No hardcoded messages — always i18n
 * - No technical details exposed to users
 * - DEV warnings for missing keys (zero PROD impact)
 */

import type { Severity, ObservabilityDomain } from '@/lib/observability/types';

// ============================================
// TYPES
// ============================================

export interface InstitutionalError {
  code: string;
  messageKey: string;
  severity: Severity;
  domain: ObservabilityDomain;
  httpStatus?: number;
  retryable: boolean;
}

// ============================================
// CANONICAL ERROR CATALOG (v2 — PI U6)
// ============================================

export const ERROR_CATALOG: Record<string, InstitutionalError> = {
  // 🔐 Authentication / Identity
  'AUTH-001': {
    code: 'AUTH-001',
    messageKey: 'institutionalErrors.AUTH-001',
    severity: 'ERROR',
    httpStatus: 401,
    retryable: false,
    domain: 'AUTH',
  },
  'AUTH-002': {
    code: 'AUTH-002',
    messageKey: 'institutionalErrors.AUTH-002',
    severity: 'ERROR',
    httpStatus: 401,
    retryable: true,
    domain: 'AUTH',
  },
  'AUTH-003': {
    code: 'AUTH-003',
    messageKey: 'institutionalErrors.AUTH-003',
    severity: 'WARN',
    httpStatus: 403,
    retryable: false,
    domain: 'AUTH',
  },
  'AUTH-004': {
    code: 'AUTH-004',
    messageKey: 'institutionalErrors.AUTH-004',
    severity: 'ERROR',
    httpStatus: 403,
    retryable: false,
    domain: 'AUTH',
  },

  // 🛡️ Authorization / Access → SECURITY domain (PI U6)
  'ACCESS-001': {
    code: 'ACCESS-001',
    messageKey: 'institutionalErrors.ACCESS-001',
    severity: 'ERROR',
    httpStatus: 403,
    retryable: false,
    domain: 'SECURITY',
  },
  'ACCESS-002': {
    code: 'ACCESS-002',
    messageKey: 'institutionalErrors.ACCESS-002',
    severity: 'ERROR',
    httpStatus: 403,
    retryable: false,
    domain: 'SECURITY',
  },
  'ACCESS-003': {
    code: 'ACCESS-003',
    messageKey: 'institutionalErrors.ACCESS-003',
    severity: 'ERROR',
    httpStatus: 403,
    retryable: false,
    domain: 'SECURITY',
  },
  'ACCESS-004': {
    code: 'ACCESS-004',
    messageKey: 'institutionalErrors.ACCESS-004',
    severity: 'CRITICAL',
    httpStatus: 403,
    retryable: false,
    domain: 'SECURITY',
  },

  // 💳 Billing
  'BILLING-001': {
    code: 'BILLING-001',
    messageKey: 'institutionalErrors.BILLING-001',
    severity: 'WARN',
    retryable: false,
    domain: 'BILLING',
  },
  'BILLING-002': {
    code: 'BILLING-002',
    messageKey: 'institutionalErrors.BILLING-002',
    severity: 'ERROR',
    retryable: false,
    domain: 'BILLING',
  },
  'BILLING-003': {
    code: 'BILLING-003',
    messageKey: 'institutionalErrors.BILLING-003',
    severity: 'ERROR',
    retryable: false,
    domain: 'BILLING',
  },

  // 🩺 System / Health
  'SYS-001': {
    code: 'SYS-001',
    messageKey: 'institutionalErrors.SYS-001',
    severity: 'ERROR',
    httpStatus: 503,
    retryable: true,
    domain: 'SYSTEM',
  },
  'SYS-002': {
    code: 'SYS-002',
    messageKey: 'institutionalErrors.SYS-002',
    severity: 'WARN',
    retryable: true,
    domain: 'SYSTEM',
  },
  'SYS-003': {
    code: 'SYS-003',
    messageKey: 'institutionalErrors.SYS-003',
    severity: 'CRITICAL',
    httpStatus: 500,
    retryable: false,
    domain: 'SYSTEM',
  },
  'SYS-004': {
    code: 'SYS-004',
    messageKey: 'institutionalErrors.SYS-004',
    severity: 'INFO',
    retryable: false,
    domain: 'SYSTEM',
  },

  // 📦 Data / Consistency → SYSTEM domain (PI U6)
  'DATA-001': {
    code: 'DATA-001',
    messageKey: 'institutionalErrors.DATA-001',
    severity: 'ERROR',
    httpStatus: 404,
    retryable: false,
    domain: 'SYSTEM',
  },
  'DATA-002': {
    code: 'DATA-002',
    messageKey: 'institutionalErrors.DATA-002',
    severity: 'ERROR',
    retryable: false,
    domain: 'SYSTEM',
  },
  'DATA-003': {
    code: 'DATA-003',
    messageKey: 'institutionalErrors.DATA-003',
    severity: 'WARN',
    retryable: false,
    domain: 'SYSTEM',
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

/**
 * DEV-only: validates catalog structural integrity.
 * - No duplicate codes
 * - No suspect retryable + CRITICAL combination
 */
export function validateErrorCatalogIntegrity(): void {
  if (import.meta.env.PROD) return;

  const seenCodes = new Set<string>();

  for (const [key, entry] of Object.entries(ERROR_CATALOG)) {
    // Check duplicate codes
    if (seenCodes.has(entry.code)) {
      console.warn(
        `[Institutional Error] ⚠️ Duplicate code "${entry.code}" found at key "${key}". ` +
        `Each error must have a unique code.`
      );
    }
    seenCodes.add(entry.code);

    // Check suspect combination
    if (entry.retryable && entry.severity === 'CRITICAL') {
      console.warn(
        `[Institutional Error] ⚠️ Suspect combination: "${entry.code}" is retryable but CRITICAL. ` +
        `CRITICAL errors should generally not be retryable.`
      );
    }
  }
}
