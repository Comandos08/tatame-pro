/**
 * OBSERVABILITY SAFE GOLD — v1.0
 *
 * Contrato mínimo, estável e congelado.
 * Eventos normalizados, best-effort, sem side effects.
 */

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
