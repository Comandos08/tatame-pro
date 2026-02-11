/**
 * 🏛️ Observability Contract Types — PI E3 / PI U5
 * 
 * FROZEN CONTRACT (PI U5)
 * - No new status, source or severity types may be introduced.
 * - Health uses HealthStatus (from src/types/health-state.ts).
 * - Logs use Severity.
 * - Domains use ObservabilityDomain.
 * 
 * CANONICAL source for all observability types.
 * 
 * SAFE GOLD: Read-only contract. No flow decisions.
 * Status: FROZEN
 */


import type { SafeHealthStatus } from '@/types/health-state';
import { logger } from './logger';

// ============================================
// CANONICAL OBSERVABILITY TAXONOMY (PI U5 — FROZEN)
// ============================================

/**
 * Canonical log severity levels.
 * 
 * NOTE: This is LOG severity, NOT audit event severity.
 * Audit events use `EventSeverity` (LOW, MEDIUM, HIGH, CRITICAL)
 * defined in `src/types/observability.ts`.
 */
export type Severity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

/**
 * Canonical observability domains.
 * No component or module may create domains outside this list.
 */
export type ObservabilityDomain =
  | 'AUTH'
  | 'IDENTITY'
  | 'TENANT'
  | 'BILLING'
  | 'MEMBERSHIP'
  | 'JOB'
  | 'SECURITY'
  | 'SYSTEM'
  | 'INTEGRATION';

// ============================================
// SAFE EVENT CONTRACT (migrated from src/observability/)
// ============================================

export const SAFE_EVENT_DOMAINS = [
  'AUTH',
  'TENANT',
  'MEMBERSHIP',
  'YOUTH',
  'BILLING',
  'EVENTS',
  'REPORTS',
  'SYSTEM',
] as const;

export type SafeEventDomain = typeof SAFE_EVENT_DOMAINS[number];

export const SAFE_EVENT_LEVELS = [
  'INFO',
  'WARN',
  'ERROR',
  'CRITICAL',
] as const;

export type SafeEventLevel = typeof SAFE_EVENT_LEVELS[number];

/**
 * Observable Event Contract (IMMUTABLE)
 */
export interface ObservableEvent {
  domain: SafeEventDomain;
  level: SafeEventLevel;
  name: string;
  message?: string;
  tenant_id?: string | null;
  user_id?: string | null;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Provider function signature
 */
export type ObservabilityProvider = (event: ObservableEvent) => void;

// ============================================
// HEALTH SIGNAL TYPES
// ============================================

export type HealthSignalType =
  | 'ERROR_RATE'
  | 'LATENCY'
  | 'THROUGHPUT'
  | 'DEGRADED_MODE'
  | 'DEPENDENCY_DOWN';

export interface HealthSignal {
  signal: HealthSignalType;
  health: SafeHealthStatus;
  domain: ObservabilityDomain;
  observedAt: string; // ISO 8601
  relatedErrorCode?: string; // Links to E2 InstitutionalError.code
}

// ============================================
// OBSERVABILITY DOMAIN MAP
// ============================================

/**
 * Semantic integration between the three observability pillars.
 * 
 * | Event               | Audit          | Error       | Health        |
 * |---------------------|----------------|-------------|---------------|
 * | Login failure        | LOGIN_FAILED   | AUTH-002    | —             |
 * | Billing gate block   | BILLING_GATE_* | BILLING-003 | ⚠️ WARNING    |
 * | Service down         | —              | SYS-001     | 🔴 CRITICAL   |
 * | Degraded mode        | —              | —           | ⚠️ DEGRADED   |
 */

// ============================================
// DEV VALIDATION
// ============================================

/**
 * DEV-only: validates a HealthSignal's structural integrity.
 * Warns on missing domain or invalid relatedErrorCode.
 */
export function validateHealthSignal(
  signal: HealthSignal,
  knownErrorCodes: Set<string>,
): void {
  if (import.meta.env.PROD) return;

  if (!signal.domain) {
    logger.warn('Invalid health signal: missing domain', {
      component: 'ObservabilityContract',
      metadata: { signal },
    });
  }

  if (signal.relatedErrorCode && !knownErrorCodes.has(signal.relatedErrorCode)) {
    logger.warn('Invalid health signal: unknown error code', {
      component: 'ObservabilityContract',
      metadata: { signal, relatedErrorCode: signal.relatedErrorCode },
    });
  }
}
