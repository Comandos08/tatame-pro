/**
 * 🏛️ Observability Contract Types — PI E3 / PI U5
 * 
 * CANONICAL source for all observability types.
 * 
 * Canonical types for health signals, connecting:
 * - Audit (what happened) — PI B3
 * - Institutional Errors (what failed) — PI E2
 * - Health Signals (how the system behaves) — PI E3
 * 
 * SAFE GOLD: Read-only contract. No flow decisions.
 * Status: FROZEN
 */

import type { ErrorContext } from '@/lib/errors/institutionalErrors';

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

export type HealthSignalStatus = 'OK' | 'WARNING' | 'CRITICAL';

export type HealthSignalSource = 'SYSTEM' | 'BILLING' | 'IDENTITY' | 'INTEGRATION';

export interface HealthSignal {
  signal: HealthSignalType;
  status: HealthSignalStatus;
  source: HealthSignalSource;
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
 * Warns on missing source or invalid relatedErrorCode.
 */
export function validateHealthSignal(
  signal: HealthSignal,
  knownErrorCodes: Set<string>,
): void {
  if (import.meta.env.PROD) return;

  if (!signal.source) {
    console.warn(
      `[Observability Contract] ⚠️ HealthSignal "${signal.signal}" has no source. ` +
      `All signals must declare a source (SYSTEM | BILLING | IDENTITY | INTEGRATION).`
    );
  }

  if (signal.relatedErrorCode && !knownErrorCodes.has(signal.relatedErrorCode)) {
    console.warn(
      `[Observability Contract] ⚠️ HealthSignal "${signal.signal}" references unknown error code ` +
      `"${signal.relatedErrorCode}". Ensure it exists in the E2 error catalog.`
    );
  }
}
